import type { AgentHandle } from '../domain/roles.ts';
import type { ForgeEvent } from '../domain/events.ts';
import type { CreditsPort } from '../ports/credits-port.ts';
import type { ModelMessage, ModelPort } from '../ports/model-port.ts';
import type { SandboxPort } from '../ports/sandbox-port.ts';

export interface OrchestratorDeps {
  sandbox: SandboxPort;
  model: ModelPort;
  credits: CreditsPort;
}

export interface Orchestrator {
  /**
   * Run one generation turn for a session and stream what happens.
   *
   * This is the single seam the whole generation loop is tested at. It knows
   * nothing about HTTP and nothing about React — everything from role dispatch
   * to skeleton-first timing to bounded self-repair lives behind this call.
   */
  run(sessionId: string, userInput: string): AsyncIterable<ForgeEvent>;
}

/** What `write_file` expects once its streamed argument JSON is complete. */
interface WriteFileArgs {
  path: string;
  content: string;
}

/**
 * Validate the model's streamed tool arguments before touching the sandbox.
 *
 * Schema validation at the boundary is the reason native tool calls were chosen
 * over an XML protocol: a malformed or truncated payload fails here, loudly,
 * instead of silently writing a half-file.
 */
function parseWriteFileArgs(raw: string): WriteFileArgs {
  const parsed: unknown = JSON.parse(raw);
  const candidate = parsed as { path?: unknown; content?: unknown };

  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    typeof candidate.path !== 'string' ||
    typeof candidate.content !== 'string'
  ) {
    throw new Error('write_file expects { path: string, content: string }');
  }
  return { path: candidate.path, content: candidate.content };
}

export function createOrchestrator(deps: OrchestratorDeps): Orchestrator {
  let messageCounter = 0;

  /**
   * One sandbox per session, reused across turns.
   *
   * Waking a paused sandbox is the real adapter's job — E2B resumes on the
   * arriving request — so the orchestrator only has to remember which sandbox
   * belongs to which session.
   */
  const sandboxBySession = new Map<string, string>();

  async function sandboxFor(sessionId: string): Promise<string> {
    const existing = sandboxBySession.get(sessionId);
    if (existing !== undefined) return existing;

    // Session and workspace are 1:1 in the MVP, so the session id doubles as
    // the workspace id the sandbox is tagged with.
    const created = await deps.sandbox.create(sessionId);
    sandboxBySession.set(sessionId, created);
    return created;
  }

  async function executeTool(
    toolName: string,
    rawArgs: string,
    sandboxId: string,
  ): Promise<unknown> {
    if (toolName !== 'write_file') {
      throw new Error(`unknown tool: ${toolName}`);
    }
    const { path, content } = parseWriteFileArgs(rawArgs);
    await deps.sandbox.writeFile(sandboxId, path, content);
    return { ok: true, path, bytes: content.length };
  }

  return {
    async *run(sessionId: string, userInput: string): AsyncIterable<ForgeEvent> {
      // Alex owns the turn: he is the only role with write access. Mike's
      // dispatch to Emma arrives with skeleton-first planning in a later ticket.
      const agentHandle: AgentHandle = 'eng';
      const messageId = `msg-${++messageCounter}`;

      yield { type: 'agent_started', agentHandle, messageId };

      const sandboxId = await sandboxFor(sessionId);
      const messages: ModelMessage[] = [{ role: 'user', content: userInput }];

      // Tool arguments arrive as fragments. Buffer them per call id until the
      // model signals the call is complete, then parse and execute once.
      const openCalls = new Map<string, { toolName: string; args: string }>();

      for await (const chunk of deps.model.stream(agentHandle, messages)) {
        switch (chunk.type) {
          case 'text': {
            yield { type: 'text_delta', agentHandle, delta: chunk.delta };
            break;
          }

          case 'tool_call_start': {
            openCalls.set(chunk.toolCallId, { toolName: chunk.toolName, args: '' });
            yield {
              type: 'tool_call_start',
              agentHandle,
              toolCallId: chunk.toolCallId,
              toolName: chunk.toolName,
            };
            break;
          }

          case 'tool_input_delta': {
            const call = openCalls.get(chunk.toolCallId);
            if (call) call.args += chunk.argsDelta;
            yield {
              type: 'tool_input_delta',
              agentHandle,
              toolCallId: chunk.toolCallId,
              argsDelta: chunk.argsDelta,
            };
            break;
          }

          case 'tool_call_end': {
            const call = openCalls.get(chunk.toolCallId);
            openCalls.delete(chunk.toolCallId);
            if (!call) break;

            try {
              const result = await executeTool(call.toolName, call.args, sandboxId);
              yield {
                type: 'tool_result',
                agentHandle,
                toolCallId: chunk.toolCallId,
                result,
              };
            } catch (error) {
              yield {
                type: 'error',
                agentHandle,
                message: error instanceof Error ? error.message : String(error),
              };
            }
            break;
          }
        }
      }

      yield { type: 'agent_done', agentHandle, creditsUsed: 0 };
    },
  };
}
