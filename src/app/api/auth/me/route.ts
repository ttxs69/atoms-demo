import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const cookie = request.headers.get('cookie') ?? '';
  const match = cookie.match(/forge_session=([^;]+)/);
  if (!match || !match[1]) return NextResponse.json({ user: null });

  // cookie 有两种格式：JSON 包装（{access_token,...}）或裸 JWT（/api/auth/session 设的）。
  // 先按 JSON 解，失败则整个值当 JWT —— 两种都要能登录。
  const raw = decodeURIComponent(match[1]);
  let accessToken: string | undefined;
  try {
    accessToken = (JSON.parse(raw) as { access_token?: string }).access_token;
  } catch {
    accessToken = raw;
  }
  if (!accessToken) return NextResponse.json({ user: null });

  // 用 APPS 验证（auth + projects 同一个 project）
  const sb = createClient(
    process.env['APPS_SUPABASE_URL']!,
    process.env['APPS_SUPABASE_PUBLISHABLE_KEY']!,
    { auth: { persistSession: false } },
  );
  const { data, error } = await sb.auth.getUser(accessToken);
  if (error || !data.user) return NextResponse.json({ user: null });
  return NextResponse.json({
    user: { id: data.user.id, email: data.user.email },
  });
}