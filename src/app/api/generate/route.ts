import { createOrchestrator } from '../../../orchestrator/orchestrator.ts';
import { E2BSandboxAdapter } from '../../../ports/e2b-sandbox-adapter.ts';
import { createModelAdapter } from '../../../ports/llm-model-adapter.ts';
import { encodeEvent } from '../../../transport/sse.ts';
import { keyFor, ledgerPort, requestScopedCredits, withRequestKey } from '../../../credits/route-credits.ts';
import { sessionVerifierFromEnv } from '../../../auth/session.ts';
import { SharedProjectGate } from '../../../backend/supabase-gate.ts';

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
  if (!dbUrl) return undefined; // degraded: no shared project, gate absent
  const { Client } = await import('pg');
  const client = new Client({ connectionString: dbUrl });
  await client.connect();
  const tx = async <T,>(fn: (c: import('../../../credits/ledger.ts').SqlClient) => Promise<T>): Promise<T> => {
    await client.query('BEGIN');
    try {
      const out = await fn(client as unknown as import('../../../credits/ledger.ts').SqlClient);
      await client.query('COMMIT');
      return out;
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    }
  };
  const wrapped = client as unknown as import('../../../credits/ledger.ts').SqlClient & { transaction: typeof tx };
  wrapped.transaction = tx;
  return new SharedProjectGate(wrapped);
}

function buildOrchestrator() {
  return Promise.all([ledgerPort(), buildGate()]).then(([ledger, gate]) =>
    createOrchestrator({
      sandbox: new E2BSandboxAdapter(process.env['E2B_API_KEY'] ?? ''),
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
    }),
  );
}

export async function POST(request: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Body must be JSON.' }, { status: 400 });
  }

  // Identity comes ONLY from the session cookie (ticket 04). A sessionId in
  // the body is ignored — declared ids were the pre-auth contract.
  const cookieSession = await sessionVerifierFromEnv().verify(request);
  if (!cookieSession) {
    return Response.json(
      { error: 'No session. Open the page to sign in anonymously first.' },
      { status: 401 },
    );
  }
  const sessionId = cookieSession;

  if (!process.env['E2B_API_KEY'] || !process.env['LLM_API_KEY']) {
    return Response.json(
      { error: 'Server is missing E2B_API_KEY or LLM_API_KEY.' },
      { status: 503 },
    );
  }


  const { message } = (body ?? {}) as {
    message?: unknown;
  };

  if (typeof sessionId !== 'string' || sessionId.length === 0) {
    return Response.json({ error: 'sessionId is required.' }, { status: 400 });
  }
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
  if (await (await ledgerPort()).isBanned(sessionId)) {
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
  const creditKey = keyFor(sessionId, message);

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const event of withRequestKey(
          creditKey,
          () => orchestrator.run(sessionId, message, { signal: abort.signal }),
        )) {
          controller.enqueue(encoder.encode(encodeEvent(event)));
        }
      } catch (error) {
        controller.enqueue(
          encoder.encode(
            encodeEvent({
              type: 'error',
              agentHandle: 'eng',
              message: error instanceof Error ? error.message : String(error),
            }),
          ),
        );
      } finally {
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
