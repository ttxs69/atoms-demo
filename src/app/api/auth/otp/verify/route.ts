import { NextResponse } from 'next/server';
import { appsSupabase } from '@/lib/supabase.ts';
import { createClient } from '@supabase/supabase-js';
import type { Session, User } from '@supabase/supabase-js';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  let body: { email?: string; code?: string };
  try {
    body = (await request.json()) as { email?: string; code?: string };
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const email = body.email?.trim().toLowerCase();
  const code = body.code?.trim();
  if (!email || !email.includes('@')) {
    return NextResponse.json({ error: '邮箱格式不对' }, { status: 400 });
  }
  if (!code || !/^\d{6}$/.test(code)) {
    return NextResponse.json({ error: '请输入 6 位数字码' }, { status: 400 });
  }

  // 1. 查 DB 验证 OTP
  const { data: row, error: dbErr } = await appsSupabase()
    .from('otp_codes')
    .select('code, expires_at, attempts')
    .eq('email', email)
    .single();

  if (dbErr || !row) {
    return NextResponse.json({ error: '验证码不存在，请重新发送' }, { status: 401 });
  }
  if (new Date(row.expires_at) < new Date()) {
    return NextResponse.json({ error: '验证码已过期，请重新发送' }, { status: 401 });
  }
  if (row.attempts >= 5) {
    return NextResponse.json({ error: '尝试次数过多，请重新发送' }, { status: 429 });
  }
  if (row.code !== code) {
    await appsSupabase()
      .from('otp_codes')
      .update({ attempts: row.attempts + 1 })
      .eq('email', email);
    return NextResponse.json({ error: '验证码错误' }, { status: 401 });
  }

  // 2. 找 / 创建用户（用 APPS Supabase，auth + projects 同一个 DB）
  const platformAdmin = createClient(
    process.env['APPS_SUPABASE_URL']!,
    process.env['APPS_SUPABASE_SECRET_KEY']!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  const { data: usersList } = await platformAdmin.auth.admin.listUsers();
  let user: User | undefined = usersList?.users.find((u) => u.email === email);

  if (!user) {
    const { data: created, error: createErr } = await platformAdmin.auth.admin.createUser({
      email,
      email_confirm: true,
    });
    if (createErr || !created.user) {
      return NextResponse.json({ error: '创建用户失败：' + createErr?.message }, { status: 500 });
    }
    user = created.user;
  } else if (!user.email_confirmed_at) {
    await platformAdmin.auth.admin.updateUserById(user.id, { email_confirm: true });
  }

  // 3. 签发 session：admin.generateLink → verifyOtp
  const { data: link, error: linkErr } = await platformAdmin.auth.admin.generateLink({
    type: 'magiclink',
    email,
  });
  if (linkErr || !link?.properties?.action_link) {
    return NextResponse.json({ error: '签发链接失败：' + linkErr?.message }, { status: 500 });
  }
  const actionUrl = new URL(link.properties.action_link);
  const tokenHash = actionUrl.searchParams.get('token');
  if (!tokenHash) {
    return NextResponse.json({ error: '无法解析签发链接' }, { status: 500 });
  }

  // 用 admin.verifyOtp 直接拿 session（admin 路径，不限流）
  const { data: verified, error: verifyErr } = await platformAdmin.auth.verifyOtp({
    token_hash: tokenHash,
    type: 'magiclink',
  });
  if (verifyErr || !verified.session || !verified.user) {
    return NextResponse.json({ error: '验证失败：' + verifyErr?.message }, { status: 500 });
  }
  const finalSession: Session = verified.session;
  const finalUser: User = verified.user;

  // 4. 清 OTP row
  await appsSupabase().from('otp_codes').delete().eq('email', email);

  // 5. 设 cookie
  const secure = request.url.startsWith('https://') ? '; Secure' : '';
  const cookieValue = JSON.stringify({
    access_token: finalSession.access_token,
    refresh_token: finalSession.refresh_token,
    expires_at: finalSession.expires_at,
  });

  return new NextResponse(
    JSON.stringify({ ok: true, user: { id: finalUser.id, email: finalUser.email } }),
    {
      status: 200,
      headers: {
        'content-type': 'application/json',
        'set-cookie': `forge_session=${encodeURIComponent(cookieValue)}; HttpOnly; Path=/; SameSite=Lax; Max-Age=2592000${secure}`,
      },
    },
  );
}