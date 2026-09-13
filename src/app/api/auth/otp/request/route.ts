import { NextResponse } from 'next/server';
import { platformSupabase } from '@/lib/supabase.ts';

export const runtime = 'nodejs';

/**
 * 发送 6 位 OTP 验证码到邮箱。
 * 不依赖 Supabase 仪表板的 SITE_URL 配置（不走 magic link）。
 */
export async function POST(request: Request) {
  let body: { email?: string };
  try {
    body = (await request.json()) as { email?: string };
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const email = body.email?.trim();
  if (!email || !email.includes('@')) {
    return NextResponse.json({ error: '邮箱格式不对' }, { status: 400 });
  }

  const { error } = await platformSupabase().auth.signInWithOtp({
    email,
    options: {
      shouldCreateUser: true,
    },
  });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}