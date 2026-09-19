import { Sandbox } from 'e2b';
import type { SqlClient } from '../credits/ledger.ts';
import type { Deleters } from './engine.ts';

/**
 * Production deleters (forge-gc ticket 02). Each wraps one external system;
 * a missing key degrades that deleter to an explicit no-op — the queue row
 * still completes (nothing to delete there), consistent with the spec's
 * degraded-honesty pattern.
 */
export interface DeleterKeys {
  e2bApiKey?: string;
  sharedDbUrl?: string;
  platformDb: SqlClient;
  platformSupabaseUrl?: string;
  platformServiceKey?: string;
}

export function productionDeleters(keys: DeleterKeys): Deleters {
  return {
    async killSandbox(workspaceId) {
      if (!keys.e2bApiKey) return;
      const paginator = Sandbox.list({
        apiKey: keys.e2bApiKey,
        query: { metadata: { workspace_id: workspaceId } },
      });
      let page = await paginator.nextItems();
      const all = [...page];
      while (paginator.hasNext) {
        page = await paginator.nextItems();
        all.push(...page);
      }
      for (const sb of all) {
        await Sandbox.kill(sb.sandboxId, { apiKey: keys.e2bApiKey });
      }
    },

    // The snapshot object lives on the same Supabase project as auth;
    // keys are the platform pair (single-project deployment, lib/supabase.ts).
    async deleteSnapshot(workspaceId) {
      if (!keys.platformSupabaseUrl || !keys.platformServiceKey) return;
      await fetch(
        `${keys.platformSupabaseUrl}/storage/v1/object/project-snapshots/${workspaceId}.json`,
        {
          method: 'DELETE',
          headers: {
            apikey: keys.platformServiceKey,
            Authorization: `Bearer ${keys.platformServiceKey}`,
          },
        },
      );
    },

    async deleteSharedRows(workspaceId) {
      if (!keys.sharedDbUrl) return;
      const { Client } = await import('pg');
      const client = new Client({ connectionString: keys.sharedDbUrl });
      await client.connect();
      try {
        // Every public table carrying the workspace column — generated-app
        // tables are unknown by name; the column is the contract.
        const tables = await client.query<{ tablename: string }>(
          `SELECT tablename FROM pg_tables t
           WHERE schemaname = 'public'
             AND EXISTS (
               SELECT 1 FROM information_schema.columns c
               WHERE c.table_schema = 'public' AND c.table_name = t.tablename
                 AND c.column_name = 'workspace_id'
             )`,
        );
        for (const { tablename } of tables.rows) {
          await client.query(`DELETE FROM "${tablename}" WHERE workspace_id = $1`, [
            workspaceId,
          ]);
        }
      } finally {
        await client.end();
      }
    },

    async deleteForgeRows(workspaceId) {
      await keys.platformDb.query(`DELETE FROM quota WHERE user_id = $1`, [workspaceId]);
      await keys.platformDb.query(`DELETE FROM credit_ledger WHERE user_id = $1`, [workspaceId]);
      await keys.platformDb.query(`DELETE FROM bans WHERE user_id = $1`, [workspaceId]);
    },

    async deleteAuthUser(workspaceId) {
      if (!keys.platformSupabaseUrl || !keys.platformServiceKey) return;
      await fetch(
        `${keys.platformSupabaseUrl}/auth/v1/admin/users/${workspaceId}`,
        {
          method: 'DELETE',
          headers: {
            apikey: keys.platformServiceKey,
            Authorization: `Bearer ${keys.platformServiceKey}`,
          },
        },
      );
    },
  };
}
