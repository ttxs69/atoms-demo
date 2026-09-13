import { NextResponse } from 'next/server';
import { appsSupabase } from '@/lib/supabase.ts';
import { randomInt } from 'crypto';
import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';

export const runtime = 'nodejs';

/**
 * 创建 Ethereal 邮件账户（首次调用会注册一个 fake SMTP，每封邮件都在
 * https://ethereal.email/messages 可看）。无需任何 dashboard 配置。
 */
let transporter: Transporter | null = null;
let etherealAccount: { user: string; pass: string; web: string } | null = null;

async function getTransporter() {
  if (transporter) return { transporter, account: etherealAccount! };
  // Ethereal：nodemailer.createTestAccount() 返回一个临时 SMTP 账户
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

  // 3. 通过 Ethereal SMTP 发邮件——后台发送，不阻塞响应
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
      const previewUrl = nodemailer.getTestMessageUrl(info);
      // eslint-disable-next-line no-console
      console.log(`[OTP] ${email} → ${code} | preview: ${previewUrl}`);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error(`[OTP] email send failed: ${e instanceof Error ? e.message : e}`);
    }
  })();

  // 4. dev 模式返回 OTP（方便测试）
  if (process.env['DEV_OTP_VISIBLE'] === '1') {
    return NextResponse.json({ ok: true, dev_code: code });
  }
  return NextResponse.json({ ok: true });
}