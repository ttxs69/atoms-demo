import type { JournalRecord } from '../journal/fold.ts';

/** One replayed row, in seq order. */
export interface ReplayedRecord {
  seq: number;
  kind: string;
  messageId: string | null;
  payload: JournalRecord;
}

/**
 * Port: the conversation journal (docs/04-persistence.md §3.2).
 *
 * Append-only per turn with delete-then-insert keyed by turnId — a retried
 * turn rewrites itself instead of duplicating. The per-session single writer
 * inside the orchestrator makes that safe without unique constraints.
 */
export interface JournalPort {
  appendTurn(projectId: string, turnId: string, records: JournalRecord[]): Promise<void>;
  replay(projectId: string, afterSeq?: number): Promise<ReplayedRecord[]>;
}
