import type { SupabaseClient } from '@supabase/supabase-js';
import type { JournalPort, ReplayedRecord } from '../ports/journal-port.ts';
import type { JournalRecord } from './fold.ts';

/**
 * The journal on the apps Supabase project. Writes go through the service
 * client (RLS bypass — clients cannot forge events); reads pair it with the
 * caller's ownership check at the route, same pattern as /api/projects.
 */
export function supabaseJournal(db: SupabaseClient): JournalPort {
  return {
    async appendTurn(projectId, turnId, records) {
      // Idempotent rewrite: a retried turn replaces its own rows. No unique
      // constraint needed — the orchestrator's per-session single writer
      // serializes turns.
      await db
        .from('project_events')
        .delete()
        .eq('project_id', projectId)
        .eq('turn_id', turnId);

      const rows = records.map((record) => ({
        project_id: projectId,
        turn_id: turnId,
        message_id: 'messageId' in record ? record.messageId : null,
        kind: record.kind,
        payload: record,
      }));
      if (rows.length === 0) return;
      const { error } = await db.from('project_events').insert(rows);
      if (error) throw new Error(error.message);
    },

    async replay(projectId, afterSeq = 0): Promise<ReplayedRecord[]> {
      const { data, error } = await db
        .from('project_events')
        .select('seq, kind, message_id, payload')
        .eq('project_id', projectId)
        .gt('seq', afterSeq)
        .order('seq');
      if (error) throw new Error(error.message);
      return (data ?? []).map((row) => ({
        seq: row.seq as number,
        kind: row.kind as string,
        messageId: (row.message_id as string | null) ?? null,
        payload: row.payload as JournalRecord,
      }));
    },
  };
}
