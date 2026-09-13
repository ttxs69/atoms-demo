import { createClient } from '@supabase/supabase-js';
import { sessionVerifierFromEnv } from '../../../../auth/session.ts';

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
  const { email, password } = (body ?? {}) as { email?: unknown; password?: unknown };
  if (typeof email !== 'string' || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return Response.json({ error: '请输入有效的邮箱地址。' }, { status: 400 });
  }
  // 密码是升级的一部分：只有邮箱没有凭据，账户在别的设备上永远登录不了。
  if (typeof password !== 'string' || password.length < 6) {
    return Response.json({ error: '请设置至少 6 位的密码——它是你下次登录的凭据。' }, { status: 400 });
  }

  const url = process.env['SUPABASE_URL'];
  const serviceKey = process.env['SUPABASE_SECRET_KEY'];
  if (!url || !serviceKey) {
    return Response.json(
      { error: 'Platform Supabase is not configured (dev mode).' },
      { status: 503 },
    );
  }

  // Server-side there is no session — auth.updateUser would act on nobody.
  // The service key's admin API updates the user the cookie identified.
  const admin = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error } = await admin.auth.admin.updateUserById(userId, { email, password });
  if (error) {
    return Response.json({ error: `升级失败：${error.message}` }, { status: 400 });
  }

  return Response.json({ ok: true, email });
}
