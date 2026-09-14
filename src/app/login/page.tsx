'use client';

/**
 * /login — OTP 邮件验证码登录。
 *
 * 为什么用 OTP 而非 magic link：magic link 依赖 Supabase 仪表板的 SITE_URL
 * 配置，目前是 localhost，会让邮件链接跳转到 localhost。
 * OTP 6 位数字码不需要 SITE_URL，也不依赖浏览器跳转。
 *
 * 体验：输入邮箱 → 收邮件 → 输入 6 位码 → 登录。
 */

import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

type Step = 'email' | 'code';

export default function LoginPage() {
  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [devCode, setDevCode] = useState<string | null>(null);

  const requestOtp = async () => {
    setLoading(true);
    setError(null);
    const res = await fetch('/api/auth/otp/request', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email }),
    });
    const data = (await res.json().catch(() => ({}))) as {
      error?: string;
      preview_url?: string;
      dev_code?: string;
    };
    setLoading(false);
    if (!res.ok) {
      setError(data.error ?? '请求失败');
      return;
    }
    setPreviewUrl(data.preview_url ?? null);
    setDevCode(data.dev_code ?? null);
    setStep('code');
  };

  const verifyOtp = async () => {
    setLoading(true);
    setError(null);
    const res = await fetch('/api/auth/otp/verify', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, code }),
    });
    const data = await res.json().catch(() => ({}));
    setLoading(false);
    if (!res.ok) {
      setError(data.error ?? '验证失败');
      return;
    }
    // 登录成功，硬刷到工作区让 server 重新读 cookie
    window.location.href = '/';
  };

  return (
    <div className="min-h-screen grid place-items-center bg-background p-5">
      <Card className="w-full max-w-md">
        <CardContent className="pt-6 space-y-3">
          <h1 className="text-2xl font-semibold tracking-tight text-center">
            Forge<span className="text-primary">.</span>
          </h1>
          <div className="bg-amber-50 border border-amber-200 rounded p-3 space-y-2">
            <p className="text-sm font-semibold text-amber-900">
              ⚠ 演示环境未配真实邮件服务
            </p>
            <p className="text-xs text-amber-800">
              当前用 Ethereal 假 SMTP，邮件不投到真实邮箱。
              验证码会出现在弹出的链接里。
            </p>
            <a
              href="https://ethereal.email/messages"
              target="_blank"
              rel="noopener noreferrer"
              className="block text-xs text-center text-amber-900 underline font-semibold"
            >
              打开 Ethereal 收件箱查看所有演示邮件 →
            </a>
          </div>

          {step === 'email' ? (
            <>
              <p className="text-sm text-muted-foreground text-center">
                输入邮箱，登录保存你的项目，或匿名直接使用。
              </p>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                aria-label="邮箱"
                autoComplete="email"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && email.includes('@') && !loading) void requestOtp();
                }}
              />
              {error ? <p className="text-sm text-destructive">{error}</p> : null}
              <Button
                onClick={() => void requestOtp()}
                disabled={!email.includes('@') || loading}
                className="w-full"
              >
                {loading ? '发送中…' : '发送验证码'}
              </Button>
            </>
          ) : (
            <>
              <p className="text-sm text-muted-foreground text-center">
                验证码已发到 <strong>{email}</strong>
              </p>
              {previewUrl ? (
                <a
                  href={previewUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block text-xs text-center text-blue-600 underline"
                >
                  👉 在 Ethereal 查看邮件内容（点此打开新窗口）
                </a>
              ) : null}
              {devCode ? (
                <p className="text-xs text-center text-amber-700 bg-amber-50 p-2 rounded">
                  Dev 模式：验证码是 <code className="font-mono font-bold">{devCode}</code>
                </p>
              ) : null}
              <Input
                type="text"
                inputMode="numeric"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                placeholder="123456"
                aria-label="6 位验证码"
                autoFocus
                className="text-center text-2xl tracking-widest"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && code.length === 6 && !loading) void verifyOtp();
                }}
              />
              {error ? <p className="text-sm text-destructive">{error}</p> : null}
              <Button
                onClick={() => void verifyOtp()}
                disabled={code.length !== 6 || loading}
                className="w-full"
              >
                {loading ? '验证中…' : '登录'}
              </Button>
              <button
                type="button"
                onClick={() => {
                  setStep('email');
                  setCode('');
                  setError(null);
                }}
                className="block w-full text-xs text-muted-foreground hover:text-foreground underline"
              >
                换个邮箱
              </button>
            </>
          )}

          <a
            href="/"
            className="block text-center text-xs text-muted-foreground hover:text-foreground underline pt-2"
          >
            跳过，继续匿名使用
          </a>
        </CardContent>
      </Card>
    </div>
  );
}