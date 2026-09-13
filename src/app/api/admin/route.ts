import { ledgerDb, ledgerPort } from '../../../credits/route-credits.ts';
import { migrateGc } from '../../../gc/engine.ts';

export const runtime = 'nodejs';

/**
 * Minimal admin panel backend (ticket 07): one bearer token, three reads
 * and two actions. No user system, no dashboard graphs — anything more is a
 * time sink the spec explicitly cut.
 */
function authorized(request: Request): boolean {
  const expected = process.env['ADMIN_TOKEN'];
  if (!expected) return false;
  return request.headers.get('authorization') === `Bearer ${expected}`;
}

export async function GET(request: Request): Promise<Response> {
  if (!authorized(request)) {
    return Response.json({ error: 'Forbidden.' }, { status: 403 });
  }
  const ledger = await ledgerPort();
  const db = await ledgerDb();
  await migrateGc(db);
  const [stats, bans, failed] = await Promise.all([
    ledger.dailyStats(),
    ledger.listBans(),
    db.query(
      `SELECT workspace_id, target, attempts, last_error, updated_at
       FROM deletion_queue WHERE state = 'failed' ORDER BY updated_at DESC`,
    ),
  ]);
  return Response.json({
    ...stats,
    bans,
    failedGc: failed.rows,
  });
}

export async function POST(request: Request): Promise<Response> {
  if (!authorized(request)) {
    return Response.json({ error: 'Forbidden.' }, { status: 403 });
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Body must be JSON.' }, { status: 400 });
  }
  const { action, userId, reason } = (body ?? {}) as {
    action?: unknown;
    userId?: unknown;
    reason?: unknown;
  };
  if (typeof userId !== 'string' || (action !== 'ban' && action !== 'unban' && action !== 'retry_gc')) {
    return Response.json({ error: 'action (ban|unban) and userId required.' }, { status: 400 });
  }
  const ledger = await ledgerPort();
  if (action === 'ban') {
    await ledger.ban(userId, typeof reason === 'string' ? reason : '');
  } else if (action === 'unban') {
    await ledger.unban(userId);
  } else if (action === 'retry_gc') {
    // 手动重试：failed 行回到 pending、计数清零（next_retry_at 由 SQL 的
    // now() 立即到期——cron 的 sweep 用传入时钟，不受此默认影响）
    const db = await ledgerDb();
    await migrateGc(db);
    await db.query(
      `UPDATE deletion_queue SET state = 'pending', attempts = 0, next_retry_at = now()
       WHERE workspace_id = $1 AND state = 'failed'`,
      [userId],
    );
  }
  return Response.json({ ok: true });
}
