import type { AgentHandle } from '../domain/roles.ts';

/**
 * A single chunk yielded by the model when streaming a response.
 *
 * Tool calls are streamed: `tool_call_start` opens one and `tool_input_delta`
 * streams its arguments. Text arrives via `text`.
 *
 * There is deliberately no `tool_result` chunk — the model does not produce
 * tool results, execution does. The orchestrator runs the tool and emits the
 * `tool_result` event itself.
 */
export type ModelChunk =
  | { type: 'text'; delta: string }
  | {
      type: 'tool_call_start';
      toolCallId: string;
      toolName: string;
    }
  | { type: 'tool_input_delta'; toolCallId: string; argsDelta: string };

export interface ModelMessage {
  role: 'user' | 'assistant';
  content: string;
}

/**
 * Port: the model.
 *
 * Orchestrator calls this once per agent turn. The implementation is an LLM;
 * in tests it is a scripted fixture that replays a pre-baked chunk sequence.
 */
export interface ModelPort {
  stream(
    agentHandle: AgentHandle,
    messages: readonly ModelMessage[],
  ): AsyncIterable<ModelChunk>;
}

/**
 * Port: the sandbox.
 *
 * Wraps all E2B calls. Orchestrator never imports the E2B SDK directly.
 *
 * Note: every sandbox created in production must carry
 * `metadata: { workspace_id }` so GC can locate it via `Sandbox.list()`.
 * The sandbox implementation, not this interface, is responsible for that.
 */
export interface SandboxPort {
  create(workspaceId: string): Promise<string>; // returns sandboxId
  writeFile(sandboxId: string, path: string, content: string): Promise<void>;
  readFile(sandboxId: string, path: string): Promise<string>;
  runCommand(sandboxId: string, cmd: string): Promise<{ exitCode: number; output: string }>;
  pause(sandboxId: string): Promise<void>;
  resume(sandboxId: string): Promise<string>; // returns sandboxId (may be a new one after resume)
  kill(sandboxId: string): Promise<void>;
}

/**
 * Port: credits.
 *
 * Two-phase accounting: `reserve` pre-deducts before the run starts (blocks
 * `blocked_credits` path if it fails), `settle` trues up to actual usage
 * afterward and refunds any over-reservation.
 */
export interface CreditsPort {
  reserve(sessionId: string, estimatedTokens: number): Promise<{ ok: boolean }>;
  settle(sessionId: string, actualTokens: number): Promise<void>;
}
