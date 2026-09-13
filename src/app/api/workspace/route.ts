import { sessionVerifierFromEnv } from '../../../auth/session.ts';
import { ledgerDb } from '../../../credits/route-credits.ts';
import { enqueue, migrateGc, sweep, type Deleters, GC_ORDER } from '../../../gc/engine.ts';
import { productionDeleters } from '../../../gc/deleters.ts';
import type { SqlClient } from '../../../credits/ledger.ts';

export const runtime = 'nodejs';

/**
 * Event-driven GC entry: deleting a project enqueues all four targets and
 * runs one immediate sweep — the user's resources are reclaimed now, not at
 * tomorrow's scan.
 */
export async function DELETE(request: Request): Promise<Response> {
  const workspaceId = await sessionVerifierFromEnv().verify(request);
  if (!workspaceId) {
    return Response.json({ error: 'No session.' }, { status: 401 });
  }

  const db = await ledgerDb();
  await migrateGc(db);
  await enqueue(db, workspaceId, GC_ORDER);

  const deleters: Deleters = productionDeleters({
    ...(process.env['E2B_API_KEY'] ? { e2bApiKey: process.env['E2B_API_KEY'] } : {}),
    ...(process.env['APPS_SUPABASE_DB_URL']
      ? { sharedDbUrl: process.env['APPS_SUPABASE_DB_URL'] }
      : {}),
    platformDb: db,
    ...(process.env['SUPABASE_URL'] && process.env['SUPABASE_SECRET_KEY']
      ? {
          platformSupabaseUrl: process.env['SUPABASE_URL'],
          platformServiceKey: process.env['SUPABASE_SECRET_KEY'],
        }
      : {}),
  });
  const report = await sweep(db, deleters);

  return Response.json({ ok: true, ...report });
}
