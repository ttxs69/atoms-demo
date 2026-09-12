import type { AgentHandle } from '../domain/roles.ts';

/**
 * A single chunk yielded by the model when streaming a response.
 *
 * Tool calls are streamed: `tool_call_start` opens one, `tool_input_delta`
 * streams its arguments, and `tool_call_end` signals the arguments are
 * complete so the caller can parse and execute them. Text arrives via `text`.
 *
 * There is deliberately no `tool_result` chunk — the model does not produce
 * tool results, execution does. The orchestrator runs the tool and emits the
 * `tool_result` event itself.
 */
export type ModelChunk =
  | { type: 'text'; delta: string }
  | { type: 'tool_call_start'; toolCallId: string; toolName: string }
  | { type: 'tool_input_delta'; toolCallId: string; argsDelta: string }
  | { type: 'tool_call_end'; toolCallId: string };

export interface ModelMessage {
  role: 'user' | 'assistant';
  content: string;
}

/** An assistant turn's tool call, replayed to the model on the next step. */
export interface ToolCallPart {
  type: 'tool-call';
  toolCallId: string;
  toolName: string;
  input: unknown;
}

/** A tool result, fed back so the model can continue the loop. */
export interface ToolResultPart {
  type: 'tool-result';
  toolCallId: string;
  toolName: string;
  output: { type: 'text'; value: string };
}

/** A step message: assistant tool calls, or the tool results answering them. */
export type StepMessage =
  | { role: 'assistant'; content: ToolCallPart[] }
  | { role: 'tool'; content: ToolResultPart[] };

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
    messages: readonly (ModelMessage | StepMessage)[],
    opts?: { signal?: AbortSignal },
  ): AsyncIterable<ModelChunk>;
}
