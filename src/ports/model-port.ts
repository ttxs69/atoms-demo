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
  | { type: 'tool_call_start'; toolCallId: string; toolName: string }
  | { type: 'tool_input_delta'; toolCallId: string; argsDelta: string };

export interface ModelMessage {
  role: 'user' | 'assistant';
  content: string;
}

/**
 * Port: the model.
 *
 * Orchestrator calls this once per agent turn. In production the implementation
 * is an LLM; in tests it is a scripted fixture replaying a pre-baked chunk
 * sequence.
 */
export interface ModelPort {
  stream(
    agentHandle: AgentHandle,
    messages: readonly ModelMessage[],
  ): AsyncIterable<ModelChunk>;
}
