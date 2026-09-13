import { createOrchestrator } from '../../../orchestrator/orchestrator.ts';
import { E2BSandboxAdapter } from '../../../ports/e2b-sandbox-adapter.ts';
import { createModelAdapter } from '../../../ports/llm-model-adapter.ts';
import { encodeEvent } from '../../../transport/sse.ts';
import { keyFor, ledgerPort, requestScopedCredits, withRequestKey } from '../../../credits/route-credits.ts';

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

function buildOrchestrator() {
  return ledgerPort().then((ledger) =>
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
    }),
  );
}

export async function POST(request: Request): Promise<Response> {
  if (!process.env['E2B_API_KEY'] || !process.env['LLM_API_KEY']) {
    return Response.json(
      { error: 'Server is missing E2B_API_KEY or LLM_API_KEY.' },
      { status: 503 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Body must be JSON.' }, { status: 400 });
  }

  const { sessionId, message } = (body ?? {}) as {
    sessionId?: unknown;
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
