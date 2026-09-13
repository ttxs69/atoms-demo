import { ledgerPort } from '../../../credits/route-credits.ts';

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
  const [stats, bans] = await Promise.all([ledger.dailyStats(), ledger.listBans()]);
  return Response.json({ ...stats, bans });
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
  if (typeof userId !== 'string' || (action !== 'ban' && action !== 'unban')) {
    return Response.json({ error: 'action (ban|unban) and userId required.' }, { status: 400 });
  }
  const ledger = await ledgerPort();
  if (action === 'ban') {
    await ledger.ban(userId, typeof reason === 'string' ? reason : '');
  } else {
    await ledger.unban(userId);
  }
  return Response.json({ ok: true });
}
