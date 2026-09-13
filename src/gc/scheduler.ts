import { sweep, type Deleters } from './engine.ts';
import { productionDeleters } from './deleters.ts';
import { ledgerDb } from '../credits/route-credits.ts';
import type { SqlClient } from '../credits/ledger.ts';

/**
 * The daily GC trigger (forge-gc ticket 02's deferred wiring).
 *
 * The sweep function existed; nothing scheduled it. This rides the
 * long-running process (ticket 14's Railway single-machine conclusion) —
 * boot + every 24h. Swapping to Railway's cron service later is deploy
 * config: the sweep itself is the same function the delete-project route
 * calls. Failures log and never kill the timer (a dead scheduler is a
 * silent rot machine).
 */
export function startGcScheduler(
  sweepFn: () => Promise<unknown> = defaultSweep,
  opts: { intervalMs?: number } = {},
): () => void {
  const intervalMs = opts.intervalMs ?? 24 * 60 * 60 * 1000;
  let stopped = false;

  const run = async (): Promise<void> => {
    try {
      await sweepFn();
    } catch (error) {
      console.error('[gc] sweep failed (will retry next interval):', error);
    }
  };

  void run();
  const timer = setInterval(() => {
    if (!stopped) void run();
  }, intervalMs);
  // unref: the scheduler must never keep the process alive by itself —
  // otherwise test runners (and any CLI importing the route) hang on exit.
  (timer as unknown as { unref?: () => void }).unref?.();

  return () => {
    stopped = true;
    clearInterval(timer);
  };
}

async function defaultSweep(): Promise<void> {
  const db = await ledgerDb();
  // The pglite dev instance starts empty; ensure the credits tables exist
  // before the sweep queries them (the generate path creates them lazily,
  // but the GC can fire first).
  const { PostgresCredits } = await import('../credits/ledger.ts');
  await PostgresCredits.migrate(db);
  // The GC's own table too.
  const { migrateGc } = await import('./engine.ts');
  await migrateGc(db);
  const deleters: Deleters = productionDeleters({
    ...(process.env['E2B_API_KEY'] ? { e2bApiKey: process.env['E2B_API_KEY'] } : {}),
    ...(process.env['APPS_SUPABASE_DB_URL']
      ? { sharedDbUrl: process.env['APPS_SUPABASE_DB_URL'] }
      : {}),
    platformDb: db as SqlClient,
    ...(process.env['SUPABASE_URL'] && process.env['SUPABASE_SECRET_KEY']
      ? {
          platformSupabaseUrl: process.env['SUPABASE_URL'],
          platformServiceKey: process.env['SUPABASE_SECRET_KEY'],
        }
      : {}),
  });
  const report = await sweep(db as SqlClient, deleters);
  if (report.executed > 0 || report.failed > 0) {
    console.log(`[gc] sweep: ${report.executed} executed, ${report.failed} failed/backoff`);
  }
}
