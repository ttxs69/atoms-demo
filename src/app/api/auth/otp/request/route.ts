import { NextResponse } from 'next/server';
import { appsSupabase } from '@/lib/supabase.ts';
import { randomInt } from 'crypto';
import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';

export const runtime = 'nodejs';

let transporter: Transporter | null = null;
let etherealAccount: { user: string; pass: string; web: string } | null = null;

async function getTransporter() {
  if (transporter) return { transporter, account: etherealAccount! };
  const testAccount = await nodemailer.createTestAccount();
  transporter = nodemailer.createTransport({
    host: 'smtp.ethereal.email',
    port: 587,
    secure: false,
    auth: { user: testAccount.user, pass: testAccount.pass },
  });
  etherealAccount = {
    user: testAccount.user,
    pass: testAccount.pass,
    web: 'https://ethereal.email/messages',
  };
  return { transporter, account: etherealAccount };
}

export async function POST(request: Request) {
  let body: { email?: string };
  try {
    body = (await request.json()) as { email?: string };
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const email = body.email?.trim().toLowerCase();
  if (!email || !email.includes('@')) {
    return NextResponse.json({ error: '邮箱格式不对' }, { status: 400 });
  }

  // 1. 自己生成 6 位 OTP
  const code = String(randomInt(100000, 999999));
  const expiresAt = new Date(Date.now() + 10 * 60_000).toISOString();

  // 2. 存到 APPS_DB
  const { error: dbErr } = await appsSupabase()
    .from('otp_codes')
    .upsert({ email, code, expires_at: expiresAt, attempts: 0 });
  if (dbErr) {
    return NextResponse.json({ error: 'OTP 存储失败：' + dbErr.message }, { status: 500 });
  }

  // 3. 邮件投递放后台——绝不阻塞响应（Ethereal 从 Railway 连很慢）
  // eslint-disable-next-line @typescript-eslint/no-floating-promises
  (async () => {
    try {
      const { transporter: t } = await getTransporter();
      const info = await t.sendMail({
        from: '"Forge" <noreply@forge.dev>',
        to: email,
        subject: 'Forge 登录验证码',
        text: `你的验证码是 ${code}，10 分钟内有效。`,
        html: `<h2>登录 Forge</h2><p>你的验证码：</p><h1 style="font-size:32px;letter-spacing:8px;font-family:monospace">${code}</h1><p>10 分钟内有效。</p>`,
      });
      const url = nodemailer.getTestMessageUrl(info);
      // eslint-disable-next-line no-console
      console.log(`[OTP] ${email} → ${code} | preview: ${typeof url === "string" ? url : "n/a"}`);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error(`[OTP] background send failed: ${e instanceof Error ? e.message : e}`);
    }
  })();

  // 4. 返回结果
  //    - dev 模式：返回 code + preview URL（方便测试 + 用户能立即看到）
  //    - 生产模式：暂时也返回（Ethereal 是 fake SMTP，preview URL 是用户唯一能看到邮件的地方）
  const isDev = process.env['DEV_OTP_VISIBLE'] === '1' || process.env['NODE_ENV'] !== 'production';
  return NextResponse.json({
    ok: true,
    ...(isDev ? { dev_code: code } : {}),
  });
}
