'use client';

/**
 * /login — 邮件 magic link 登录（正路）。
 * Supabase SITE_URL 已指向生产域名，邮件里的链接跳回本站 /auth/confirm。
 * 注意：Supabase 免费层自带邮件限流 ~2-4 封/小时，够演示。
 */

import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sendLink = async () => {
    setLoading(true);
    setError(null);
    try {
      const { createClient } = await import('@supabase/supabase-js');
      const url = process.env.NEXT_PUBLIC_APPS_SUPABASE_URL;
      const key = process.env.NEXT_PUBLIC_APPS_SUPABASE_PUBLISHABLE_KEY;
      if (!url || !key) throw new Error('认证服务未配置');
      const supabase = createClient(url, key);
      const { error: otpErr } = await supabase.auth.signInWithOtp({
        email,
        options: {
          shouldCreateUser: true,
          emailRedirectTo: `${window.location.origin}/auth/confirm`,
        },
      });
      if (otpErr) throw otpErr;
      setSent(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : '发送失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen grid place-items-center bg-background p-5">
      <Card className="w-full max-w-md">
        <CardContent className="pt-6 space-y-3">
          <h1 className="text-2xl font-semibold tracking-tight text-center">
            Forge<span className="text-primary">.</span>
          </h1>

          {sent ? (
            <div className="space-y-3 text-center">
              <p className="text-sm text-muted-foreground">
                登录链接已发到 <strong>{email}</strong>
                <br />
                打开邮件，点「Log In」即可回到 Forge。
              </p>
              <p className="text-xs text-muted-foreground">
                没收到？检查垃圾邮件箱；Supabase 免费邮件服务每小时限发几封，稍等再试。
              </p>
              <button
                type="button"
                onClick={() => setSent(false)}
                className="text-xs text-muted-foreground hover:text-foreground underline"
              >
                换个邮箱
              </button>
            </div>
          ) : (
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
                  if (e.key === 'Enter' && email.includes('@') && !loading) void sendLink();
                }}
              />
              {error ? <p className="text-sm text-destructive">{error}</p> : null}
              <Button
                onClick={() => void sendLink()}
                disabled={!email.includes('@') || loading}
                className="w-full"
              >
                {loading ? '发送中…' : '发送登录链接'}
              </Button>
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