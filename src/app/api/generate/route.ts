import { createOrchestrator } from '../../../orchestrator/orchestrator.ts';
import { E2BSandboxAdapter } from '../../../ports/e2b-sandbox-adapter.ts';
import { createModelAdapter } from '../../../ports/llm-model-adapter.ts';
import { encodeEvent } from '../../../transport/sse.ts';
import type { StreamEvent } from '../../../domain/events.ts';
import { foldTurn } from '../../../journal/fold.ts';
import { supabaseJournal } from '../../../journal/supabase-journal.ts';
import type { JournalPort } from '../../../ports/journal-port.ts';
import { supabaseSnapshot, syncProjectFiles } from '../../../ports/supabase-snapshot.ts';
import { appsSupabase } from '../../../lib/supabase.ts';
import { keyFor, ledgerPort, requestScopedCredits, withRequestKey } from '../../../credits/route-credits.ts';
import { sessionVerifierFromEnv } from '../../../auth/session.ts';
import { SharedProjectGate } from '../../../backend/supabase-gate.ts';
import { startGcScheduler } from '../../../gc/scheduler.ts';

// The long-running process IS the cron carrier (ticket 14): the daily GC
// sweep rides the same process as the app. One timer per process.
void startGcScheduler();

export const runtime = 'nodejs';

const MAX_MESSAGE_LENGTH = 4000;

/**
 * The orchestrator is a module-level singleton so `sandboxBySession` (inside
 * `createOrchestrator`) survives across HTTP requests in the same process.
 *
 * The LLM provider is env-driven: any OpenAI-compatible or Anthropic-protocol
 * endpoint works (deepseek / glm / minimax all covered). See llm-model-adapter.
 */
let orchestratorPromise: Promise<ReturnType<typeof createOrchestrator>> | null =
  null;

async function buildGate() {
  const dbUrl = process.env['APPS_SUPABASE_DB_URL'];
  if (!dbUrl) return undefined;
  // Lazy: the gate connects only when a migration check actually runs.
  // This class never touches the network at construction time.
  return new SharedProjectGate(null, dbUrl);
}

function buildOrchestrator() {
  return Promise.all([ledgerPort(), buildGate()]).then(([ledger, gate]) => {
    const sandbox = new E2BSandboxAdapter(process.env['E2B_API_KEY'] ?? '');
    return createOrchestrator({
      sandbox,
      model: createModelAdapter({
        protocol: process.env['LLM_PROTOCOL'] === 'anthropic' ? 'anthropic' : 'openai',
        baseUrl: process.env['LLM_BASE_URL'] ?? 'https://api.deepseek.com/v1',
        apiKey: process.env['LLM_API_KEY'] ?? '',
        model: process.env['LLM_MODEL'] ?? 'deepseek-chat',
      }),
      // The stable port reads the per-request idempotency key from async
      // context — the singleton keeps its sandbox/session state while
      // credits stay per-request.
      credits: requestScopedCredits(ledger),
      ...(gate ? { gate } : {}),
      // Cold restore (docs/04 §3.3): no sandbox anywhere → snapshot is truth.
      ...(appsConfigured() ? { snapshot: supabaseSnapshot(appsSupabase(), sandbox) } : {}),
    });
  });
}

function appsConfigured(): boolean {
  return Boolean(process.env['APPS_SUPABASE_URL'] && process.env['APPS_SUPABASE_SECRET_KEY']);
}

/** Persistence is wired only when the apps project is configured. */
function journalFromEnv(): JournalPort | null {
  return appsConfigured() ? supabaseJournal(appsSupabase()) : null;
}

/**
 * MVP: session ↔ project is 1:1 — the user's most recently opened project,
 * created on first generation. Named from the first message so the projects
 * list reads meaningfully without a separate naming step.
 */
async function resolveProject(
  userId: string,
  firstMessage: string,
): Promise<string | null> {
  const db = appsSupabase();
  const { data } = await db
    .from('projects')
    .select('id')
    .eq('user_id', userId)
    .neq('status', 'archived')
    .order('last_opened_at', { ascending: false, nullsFirst: false })
    .limit(1);
  if (data && data[0]) return data[0].id as string;

  const name = firstMessage.trim().slice(0, 24) || '未命名项目';
  const { data: created, error } = await db
    .from('projects')
    .insert({ user_id: userId, name, status: 'generating' })
    .select('id')
    .single();
  if (error || !created) return null;
  return created.id as string;
}

export async function POST(request: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Body must be JSON.' }, { status: 400 });
  }

  // Identity 来自 verifier：DevVerifier（无 Supabase env）信任 x-dev-session；
  // SupabaseVerifier 读 forge_session cookie（dev-{id} cookie 走快速路径）。
  const sessionId = await sessionVerifierFromEnv().verify(request);
  if (!sessionId) {
    return Response.json(
      { error: 'No session. Open the page to sign in anonymously first.' },
      { status: 401 },
    );
  }

  if (!process.env['E2B_API_KEY'] || !process.env['LLM_API_KEY']) {
    return Response.json(
      { error: 'Server is missing E2B_API_KEY or LLM_API_KEY.' },
      { status: 503 },
    );
  }


  const { message, projectId: requestedProjectId } = (body ?? {}) as {
    message?: unknown;
    projectId?: unknown;
  };

  if (sessionId === null || sessionId.length === 0) {
    return Response.json({ error: 'sessionId is required.' }, { status: 400 });
  }
  const nonNullSessionId: string = sessionId;
  if (typeof message !== 'string' || message.trim().length === 0) {
    return Response.json({ error: 'message cannot be empty.' }, { status: 400 });
  }
  if (message.length > MAX_MESSAGE_LENGTH) {
    return Response.json(
      { error: `message exceeds ${MAX_MESSAGE_LENGTH} characters.` },
      { status: 400 },
    );
  }

  const orchestrator = await (orchestratorPromise ??= buildOrchestrator());

  // Banned identities stop before anything meterable happens.
  if (await (await ledgerPort()).isBanned(nonNullSessionId)) {
    return Response.json({ error: '该账号已被停用。' }, { status: 403 });
  }

  const encoder = new TextEncoder();
  // The stop button aborts the client fetch; the stream's cancel hook and
  // request.signal (client disconnect) both propagate into the orchestrator.
  const abort = new AbortController();
  request.signal.addEventListener('abort', () => abort.abort(), { once: true });

  // One idempotency key per logical user message: retries dedupe, distinct
  // messages budget independently. Async context carries it into the
  // singleton orchestrator's reserve/settle calls.
  const creditKey = keyFor(nonNullSessionId, message);

  // Persistence (docs/04): only real Supabase identities have a projects
  // row — dev sessions keep the pre-persistence behavior untouched.
  const journal = sessionId.startsWith('dev-') ? null : journalFromEnv();
  let projectId: string | null = null;
  if (journal) {
    if (typeof requestedProjectId === 'string' && requestedProjectId.length > 0) {
      // 显式目标（新建模式/绑定后的工作区）：验属主后使用，不验则 403——
      // 宁拒也不能把别人的项目当目标。
      const { data: owned } = await appsSupabase()
        .from('projects')
        .select('id')
        .eq('id', requestedProjectId)
        .eq('user_id', nonNullSessionId)
        .single();
      if (!owned) {
        return Response.json({ error: 'Project not found for this user.' }, { status: 403 });
      }
      projectId = requestedProjectId;
    } else {
      projectId = await resolveProject(nonNullSessionId, message);
    }
    if (!projectId) {
      return Response.json({ error: 'Could not resolve project.' }, { status: 500 });
    }
    void appsSupabase()
      .from('projects')
      .update({ status: 'generating', updated_at: new Date().toISOString() })
      .eq('id', projectId);
  }

  // The turn's events, folded and appended once the stream ends. Buffering
  // the whole turn (not write-through per event) is deliberate: a crash
  // mid-turn loses exactly that turn — the WAL/checkpoint fault table.
  const turnEvents: StreamEvent[] = [];
  let previewReady = false;
  let snapshotFiles = 0;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const event of withRequestKey(
          creditKey,
          () => orchestrator.run(nonNullSessionId, message, { signal: abort.signal }),
        )) {
          turnEvents.push(event);
          if (event.type === 'run_step' && event.step === 'preview_ready') {
            previewReady = true;
            snapshotFiles = event.snapshotFiles ?? 0;
          }
          controller.enqueue(encoder.encode(encodeEvent(event)));
        }
      } catch (error) {
        const failure: StreamEvent = {
          type: 'error',
          agentHandle: 'eng',
          message: error instanceof Error ? error.message : String(error),
        };
        turnEvents.push(failure);
        controller.enqueue(encoder.encode(encodeEvent(failure)));
      } finally {
        if (projectId && journal) {
          try {
            await journal.appendTurn(projectId, creditKey, foldTurn(message, turnEvents));
          } catch (error) {
            console.error('journal append failed:', error);
          }
          if (previewReady) {
            // The checkpoint itself ran inside the pipeline (hot, pre-pause).
            // Here: sync the file manifest from the committed snapshot, THEN
            // flip the projects row — chained so `status=ready` implies
            // "manifest synced" (the e2e gate and the detail page both lean
            // on this ordering). Fire-and-forget, errors logged.
            void syncProjectFiles(appsSupabase(), projectId, nonNullSessionId)
              .then(() =>
                appsSupabase()
                  .from('projects')
                  .update({
                    status: 'ready',
                    file_count: snapshotFiles,
                    updated_at: new Date().toISOString(),
                  })
                  .eq('id', projectId),
              )
              .then(({ error }) => {
                if (error) console.error('projects update failed:', error.message);
              })
              .catch((error) => console.error('project files sync failed:', error));
          }
        }
        controller.close();
      }
    },
    cancel() {
      abort.abort();
    },
  });

  return new Response(stream, {
    headers: {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache, no-transform',
      connection: 'keep-alive',
    },
  });
}
