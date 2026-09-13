import { NextResponse } from 'next/server';
import { platformSupabase } from '@/lib/supabase.ts';

export const runtime = 'nodejs';

/**
 * 验证 6 位 OTP 码，签发 session，设 cookie。
 */
export async function POST(request: Request) {
  let body: { email?: string; code?: string };
  try {
    body = (await request.json()) as { email?: string; code?: string };
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const email = body.email?.trim();
  const code = body.code?.trim();
  if (!email || !email.includes('@')) {
    return NextResponse.json({ error: '邮箱格式不对' }, { status: 400 });
  }
  if (!code || !/^\d{6}$/.test(code)) {
    return NextResponse.json({ error: '请输入 6 位数字码' }, { status: 400 });
  }

  const { data, error } = await platformSupabase().auth.verifyOtp({
    email,
    token: code,
    type: 'email',
  });
  if (error || !data.session || !data.user) {
    return NextResponse.json({ error: error?.message ?? '验证码错误' }, { status: 401 });
  }

  // 设置 forge_session cookie：包含 access + refresh + expires
  const secure = request.url.startsWith('https://') ? '; Secure' : '';
  const cookieValue = JSON.stringify({
    access_token: data.session.access_token,
    refresh_token: data.session.refresh_token,
    expires_at: data.session.expires_at,
  });
  return new NextResponse(
    JSON.stringify({ ok: true, user: { id: data.user.id, email: data.user.email } }),
    {
      status: 200,
      headers: {
        'content-type': 'application/json',
        'set-cookie': `forge_session=${encodeURIComponent(cookieValue)}; HttpOnly; Path=/; SameSite=Lax; Max-Age=2592000${secure}`,
      },
    },
  );
}