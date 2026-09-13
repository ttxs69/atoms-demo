import { createClient } from '@supabase/supabase-js';
import { SESSION_COOKIE, sessionVerifierFromEnv } from '../../../../auth/session.ts';

export const runtime = 'nodejs';

/**
 * Upgrade the anonymous session to a permanent account (ticket 06).
 *
 * One email, no verification mail (a disclosed demo-scale tradeoff — the
 * spec keeps placeholder-level verification). updateUser() on the caller's
 * own token flips the JWT's is_anonymous; data rides along natively.
 */
export async function POST(request: Request): Promise<Response> {
  const userId = await sessionVerifierFromEnv().verify(request);
  if (!userId) {
    return Response.json({ error: 'No session.' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Body must be JSON.' }, { status: 400 });
  }
  const { email } = (body ?? {}) as { email?: unknown };
  if (typeof email !== 'string' || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return Response.json({ error: '请输入有效的邮箱地址。' }, { status: 400 });
  }

  const url = process.env['SUPABASE_URL'];
  const anonKey = process.env['SUPABASE_ANON_KEY'];
  if (!url || !anonKey) {
    return Response.json(
      { error: 'Platform Supabase is not configured (dev mode).' },
      { status: 503 },
    );
  }

  const token = readCookie(request.headers.get('cookie'));
  const client = createClient(url, anonKey);
  const { error } = await client.auth.updateUser(
    { email },
    // The caller's own token authorizes the update on their own account.
    { headers: { Authorization: `Bearer ${token}` } } as never,
  );
  if (error) {
    return Response.json({ error: `升级失败：${error.message}` }, { status: 400 });
  }

  return Response.json({ ok: true, email });
}

function readCookie(header: string | null): string {
  if (!header) return '';
  for (const part of header.split(';')) {
    const [name, ...rest] = part.trim().split('=');
    if (name === SESSION_COOKIE) return decodeURIComponent(rest.join('='));
  }
  return '';
}
