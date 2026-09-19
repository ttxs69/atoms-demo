import type { StreamEvent } from '../domain/events.ts';

/**
 * The persistence fold (docs/04-persistence.md §3.2).
 *
 * `text_delta` / `tool_input_delta` are wire encodings, not records — this
 * folds a whole turn's stream into the complete messages that replay
 * hydrates from. Transient events never reach a record: events.ts already
 * keeps them out of the durable union, and the fold honors that contract.
 *
 * Consistency rule: the folded records must rebuild the SAME message list
 * the live `applyEvent` builds. Every divergence is a replay bug.
 */

/** One persisted conversation message. One row per message, not per event. */
export interface AgentMessageRecord {
  kind: 'agent_message';
  messageId: string | null;
  agentHandle: string;
  text: string;
  /** One entry per tool_result — path null when the tool returned no path
   * (plan_files), exactly like the live FileEntry. */
  files: { path: string | null; bytes: number | null }[];
  errors: string[];
  /** Null when no agent_done carried credits for this buffer. */
  creditsUsed: number | null;
  /** True only when the stream ended with the buffer still open (abort). */
  aborted: boolean;
}

export interface UserMessageRecord {
  kind: 'user_message';
  messageId: string | null;
  text: string;
}

export type JournalRecord = UserMessageRecord | AgentMessageRecord;

interface OpenBuffer {
  messageId: string | null;
  agentHandle: string;
  text: string;
  files: { path: string | null; bytes: number | null }[];
  errors: string[];
}

function close(
  buf: OpenBuffer,
  creditsUsed: number | null,
  aborted: boolean,
): AgentMessageRecord {
  return {
    kind: 'agent_message',
    messageId: buf.messageId,
    agentHandle: buf.agentHandle,
    text: buf.text,
    files: buf.files,
    errors: buf.errors,
    creditsUsed,
    aborted,
  };
}

/**
 * Fold one turn. Handle-scoped buffers: agent_started opens — flushing any
 * buffer the handle still holds (the self-repair loop nests a fix turn
 * inside the build turn; the outer buffer's streamed text must survive) —
 * and agent_done closes. Tool results carry path/bytes so the tool's JSON
 * args never need re-parsing here.
 */
export function foldTurn(userText: string, events: StreamEvent[]): JournalRecord[] {
  const records: JournalRecord[] = [
    { kind: 'user_message', messageId: null, text: userText },
  ];
  const open = new Map<string, OpenBuffer>();

  const bufferFor = (handle: string): OpenBuffer => {
    let buf = open.get(handle);
    if (!buf) {
      // No agent_started precedes this event. Only reachable for the
      // route-level catch's orphan error (folded into an empty bubble so
      // replay shows WHY a turn died); the orchestrator always starts first.
      buf = { messageId: null, agentHandle: handle, text: '', files: [], errors: [] };
      open.set(handle, buf);
    }
    return buf;
  };

  for (const event of events) {
    switch (event.type) {
      case 'agent_started': {
        const previous = open.get(event.agentHandle);
        if (previous) {
          // Nested turn (autofix): the previous buffer finished its steps —
          // keep its text, only the stream-end flush counts as aborted.
          open.delete(event.agentHandle);
          records.push(close(previous, null, false));
        }
        open.set(event.agentHandle, {
          messageId: event.messageId,
          agentHandle: event.agentHandle,
          text: '',
          files: [],
          errors: [],
        });
        break;
      }
      case 'text_delta': {
        bufferFor(event.agentHandle).text += event.delta;
        break;
      }
      case 'tool_result': {
        const result = event.result as { path?: string; bytes?: number } | null;
        bufferFor(event.agentHandle).files.push({
          path: result?.path ?? null,
          bytes: result?.bytes ?? null,
        });
        break;
      }
      case 'error': {
        bufferFor(event.agentHandle).errors.push(event.message);
        break;
      }
      case 'agent_done': {
        const buf = open.get(event.agentHandle);
        if (buf) {
          open.delete(event.agentHandle);
          records.push(close(buf, event.creditsUsed, false));
        }
        break;
      }
      default:
        break; // transient events are not persisted, by contract
    }
  }

  // Stream ended mid-turn (abort / crash): whatever accumulated survives,
  // flagged aborted — the events tell the truth about what happened.
  for (const buf of open.values()) {
    records.push(close(buf, null, true));
  }
  return records;
}
