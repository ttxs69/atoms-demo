'use client';

/**
 * /auth/confirm — magic link 落地页。
 * 邮件链接（PKCE flow）会带 ?code=... 跳到这里；supabase-js 的
 * detectSessionInUrl 自动用 code 换 session，onAuthStateChange 触发后
 * 把 access token POST 给 /api/auth/session 换我们自己的 httpOnly cookie，
 * 然后跳回工作区。
 * 兜底：旧式链接带 ?token_hash=...&type=... 时手动 verifyOtp。
 */

import { useEffect, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';

export default function AuthConfirmPage() {
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let done = false;
    void (async () => {
      try {
        const { createClient } = await import('@supabase/supabase-js');
        const url = process.env.NEXT_PUBLIC_APPS_SUPABASE_URL;
        const key = process.env.NEXT_PUBLIC_APPS_SUPABASE_PUBLISHABLE_KEY;
        if (!url || !key) throw new Error('认证服务未配置');

        const supabase = createClient(url, key);
        const params = new URLSearchParams(window.location.search);
        const next = params.get('next') || '/';

        // 主路：detectSessionInUrl 在 createClient 后自动消费 ?code=
        supabase.auth.onAuthStateChange(async (event, session) => {
          if (done) return;
          if ((event === 'SIGNED_IN' || event === 'USER_UPDATED') && session?.access_token) {
            done = true;
            await fetch('/api/auth/session', {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ accessToken: session.access_token }),
            }).catch(() => {});
            window.location.href = next;
          }
        });

        // 兜底：?token_hash= 老式链接
        const tokenHash = params.get('token_hash');
        if (tokenHash) {
          const type = (params.get('type') || 'magiclink') as 'magiclink';
          const { data, error: vErr } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
          if (!vErr && data.session?.access_token && !done) {
            done = true;
            await fetch('/api/auth/session', {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ accessToken: data.session.access_token }),
            }).catch(() => {});
            window.location.href = next;
          } else if (vErr && !done) {
            setError(vErr.message);
          }
        }

        // 10 秒还没成功就报错（链接可能已失效/被消费过）
        setTimeout(() => {
          if (!done) setError('登录链接无效或已过期，请回登录页重新发送。');
        }, 10_000);
      } catch (e) {
        setError(e instanceof Error ? e.message : '验证失败');
      }
    })();
  }, []);

  return (
    <div className="min-h-screen grid place-items-center bg-background p-5">
      <Card className="w-full max-w-md">
        <CardContent className="pt-6 text-center">
          {error ? (
            <div className="space-y-3">
              <p className="text-sm text-destructive">{error}</p>
              <a href="/login" className="text-sm underline">回登录页重发</a>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">正在验证登录…</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}