import type { AgentHandle } from './roles.ts';

/**
 * The seven top-level events the conversation panel consumes.
 *
 * Every event carries `agentHandle` so the frontend routes by role without
 * changes when roles later run in parallel.
 *
 * Do NOT add progress events to this union. High-frequency, in-the-moment
 * status updates are `TransientEvent`s (see below) — they skip persistence.
 */
export type ForgeEvent =
  | { type: 'agent_started'; agentHandle: AgentHandle; messageId: string }
  | { type: 'text_delta'; agentHandle: AgentHandle; delta: string }
  | {
      type: 'tool_call_start';
      agentHandle: AgentHandle;
      toolCallId: string;
      toolName: string;
    }
  | {
      type: 'tool_input_delta';
      agentHandle: AgentHandle;
      toolCallId: string;
      argsDelta: string;
    }
  | {
      type: 'tool_result';
      agentHandle: AgentHandle;
      toolCallId: string;
      result: unknown;
    }
  | { type: 'agent_done'; agentHandle: AgentHandle; creditsUsed: number }
  | { type: 'error'; agentHandle: AgentHandle; message: string };

/**
 * Progress events that are high-frequency and only meaningful in the moment.
 *
 * These are deliberately kept out of `ForgeEvent`: they are not persisted, do
 * not replay after a refresh, and must not make the persistence layer pay for
 * transient state.
 *
 * - `plan_ready`    — the trigger for skeleton-first. Without it, nothing but a
 *                     spinner exists until the first file is written.
 * - `gate_started`  — the two security gates take 5-15s combined; silence reads
 *                     as a hang.
 * - `sandbox_state` — resume takes about a second, but it cannot be silent.
 * - `run_step`      — the post-generation pipeline (install / build / dev
 *                     server / preview URL). These steps can each take tens of
 *                     seconds; without them the gap between the last file
 *                     write and the preview is a black hole.
 */
export type TransientEvent =
  | { type: 'plan_ready'; files: readonly string[] }
  | { type: 'gate_started'; gate: string }
  | { type: 'sandbox_state'; state: 'booting' | 'resuming' | 'ready' | 'paused' }
  | {
      type: 'run_step';
      step: 'installing' | 'building' | 'starting' | 'preview_ready';
      /** Present on preview_ready: the URL the preview iframe should load. */
      url?: string;
    };

/**
 * Everything that travels to the browser: durable events plus transient
 * progress. The transport carries both; only `ForgeEvent`s are persisted.
 */
export type StreamEvent = ForgeEvent | TransientEvent;
