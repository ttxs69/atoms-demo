import type { SqlClient } from '../credits/ledger.ts';

/**
 * The GC engine (forge-gc ticket 01): queue table, expiry derivation, sweep.
 *
 * The engine imports NO external SDK — every destructive action goes through
 * the injected Deleters port (tests record call order; production wraps
 * E2B/Supabase/pg). Order is a dependency order and never varies:
 * sandbox → shared-project rows → platform rows → auth user LAST.
 */

export type GcTarget = 'sandbox' | 'supabase_rows' | 'forge_rows' | 'auth_user';

/** Deletion order is the dependency order (spec: never varied). */
export const GC_ORDER: readonly GcTarget[] = [
  'sandbox',
  'supabase_rows',
  'forge_rows',
  'auth_user',
];

export interface Deleters {
  killSandbox(workspaceId: string): Promise<void>;
  deleteSharedRows(workspaceId: string): Promise<void>;
  deleteForgeRows(workspaceId: string): Promise<void>;
  deleteAuthUser(workspaceId: string): Promise<void>;
}

export const DDL = `CREATE TABLE IF NOT EXISTS deletion_queue (
  id serial PRIMARY KEY,
  workspace_id text NOT NULL,
  target text NOT NULL,
  state text NOT NULL DEFAULT 'pending' CHECK (state IN ('pending','done','failed')),
  attempts int NOT NULL DEFAULT 0,
  last_error text NOT NULL DEFAULT '',
  next_retry_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, target)
)`;

export async function migrateGc(db: SqlClient): Promise<void> {
  // Embedded Postgres defaults to the host's timezone, which makes now()
  // and timestamptz comparisons drift against UTC ISO strings. Pin UTC.
  await db.query("SET timezone = 'UTC'");
  for (const stmt of DDL.split(';')) {
    const t = stmt.trim();
    if (t.length > 0) await db.query(t);
  }
}

export interface ActivityRow {
  user_id: string;
  last_activity: Date;
}

/**
 * Derive expiry from ledger activity (pure): a user idle past the threshold
 * expires wholesale; a sandbox expires on its own (shorter) clock. Boundaries
 * tested to the day — exactly 30 days is NOT expired, 30 days + 1ms is.
 */
export function deriveExpired(
  activity: readonly ActivityRow[],
  now: Date,
  opts: { userIdleDays?: number; sandboxIdleDays?: number } = {},
): { expiredUsers: string[]; idleSandboxes: string[] } {
  const userIdleDays = opts.userIdleDays ?? 30;
  const sandboxIdleDays = opts.sandboxIdleDays ?? 14;
  const expiredUsers: string[] = [];
  const idleSandboxes: string[] = [];
  for (const row of activity) {
    const idleMs = now.getTime() - row.last_activity.getTime();
    if (idleMs > userIdleDays * 86_400_000) expiredUsers.push(row.user_id);
    else if (idleMs > sandboxIdleDays * 86_400_000) idleSandboxes.push(row.user_id);
  }
  return { expiredUsers, idleSandboxes };
}

/** Idempotent enqueue: any existing row (any state) means "known already". */
export async function enqueue(
  db: SqlClient,
  workspaceId: string,
  targets: readonly GcTarget[],
  now = new Date(),
): Promise<void> {
  for (const target of targets) {
    await db.query(
      `INSERT INTO deletion_queue (workspace_id, target, next_retry_at)
       VALUES ($1, $2, $3)
       ON CONFLICT (workspace_id, target) DO NOTHING`,
      [workspaceId, target, now.toISOString()],
    );
  }
}

export interface SweepReport {
  executed: number;
  failed: number;
}

const BACKOFF_BASE_MS = 60_000;
const MAX_ATTEMPTS = 5;

export async function sweep(
  db: SqlClient,
  deleters: Deleters,
  now = new Date(),
): Promise<SweepReport> {
  const report = { executed: 0, failed: 0 };

  // 1. Age-based enqueue (cron half of the trigger).
  const activity = await db.query<{ user_id: string; last_activity: Date }>(
    `SELECT user_id, MAX(created_at) AS last_activity
     FROM credit_ledger GROUP BY user_id`,
  );
  const { expiredUsers, idleSandboxes } = deriveExpired(activity.rows, now);
  // next_retry_at uses the sweep's own clock: rows enqueued this sweep are
  // due THIS sweep (the default now() lands microseconds after `now` and
  // would never pass the <= cutoff).
  for (const user of expiredUsers) await enqueue(db, user, GC_ORDER, now);
  for (const user of idleSandboxes) await enqueue(db, user, ['sandbox'], now);

  // 2. Execute due pending rows in dependency order.
  for (const target of GC_ORDER) {
    const rows = await db.query<{ id: number; workspace_id: string; attempts: number }>(
      `SELECT id, workspace_id, attempts FROM deletion_queue
       WHERE target = $1 AND state = 'pending' AND next_retry_at <= $2
       ORDER BY created_at`,
      [target, now.toISOString()],
    );
    for (const row of rows.rows) {
      try {
        await runDeleter(deleters, target, row.workspace_id);
        await db.query(
          `UPDATE deletion_queue SET state = 'done', updated_at = $2 WHERE id = $1`,
          [row.id, now.toISOString()],
        );
        report.executed += 1;
      } catch (error) {
        const attempts = row.attempts + 1;
        const message = error instanceof Error ? error.message.slice(0, 300) : String(error);
        const state = attempts >= MAX_ATTEMPTS ? 'failed' : 'pending';
        await db.query(
          `UPDATE deletion_queue
           SET attempts = $2, last_error = $3, state = $4,
               next_retry_at = $5, updated_at = $6
           WHERE id = $1`,
          [
            row.id,
            attempts,
            message,
            state,
            new Date(now.getTime() + 2 ** attempts * BACKOFF_BASE_MS).toISOString(),
            now.toISOString(),
          ],
        );
        report.failed += 1;
      }
    }
  }
  return report;
}

function runDeleter(deleters: Deleters, target: GcTarget, workspaceId: string): Promise<void> {
  switch (target) {
    case 'sandbox':
      return deleters.killSandbox(workspaceId);
    case 'supabase_rows':
      return deleters.deleteSharedRows(workspaceId);
    case 'forge_rows':
      return deleters.deleteForgeRows(workspaceId);
    case 'auth_user':
      return deleters.deleteAuthUser(workspaceId);
  }
}
