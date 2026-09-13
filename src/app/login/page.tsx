'use client';

/**
 * /login — 魔法链接登录（零密码）。
 *
 * 最佳实践：Linear、Notion、Slack、Vercel 都用这种。
 * 输入邮箱 → 收邮件 → 点链接 = 登录 + 邮箱验证（同一动作）。
 * 无密码管理 → 无密码泄露 → 无需密码二次确认。
 */

import { useEffect, useState } from 'react';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { Auth } from '@supabase/auth-ui-react';
import { ThemeSupa } from '@supabase/auth-ui-shared';
import { Card, CardContent } from '@/components/ui/card';

export default function LoginPage() {
  // 客户端组件（'use client'），不在服务端渲染。直接创建客户端。
  const [supabase, setSupabase] = useState<SupabaseClient | null>(null);
  useEffect(() => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (url && anonKey) setSupabase(createClient(url, anonKey));
  }, []);

  useEffect(() => {
    if (!supabase) return;
    const { data: authListener } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (event === 'SIGNED_IN' && session?.access_token) {
          await fetch('/api/auth/session', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ accessToken: session.access_token }),
          });
          window.location.href = '/';
        }
      },
    );
    return () => authListener.subscription.unsubscribe();
  }, [supabase]);

  if (!supabase) {
    return (
      <div className="min-h-screen grid place-items-center bg-background p-5">
        <Card>
          <CardContent className="pt-6">加载中…</CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen grid place-items-center bg-background p-5">
      <Card className="w-full max-w-md">
        <CardContent className="pt-6 space-y-3">
          <h1 className="text-2xl font-semibold tracking-tight text-center">
            Forge<span className="text-primary">.</span>
          </h1>
          <p className="text-sm text-muted-foreground text-center">
            输入邮箱，点登录，邮件里的链接就是你的登录方式。
            <br />
            没有密码，不会泄露。
          </p>
          <Auth
            supabaseClient={supabase}
            appearance={{ theme: ThemeSupa }}
            view="magic_link"
            showLinks={false}
            providers={[]}
            redirectTo="/"
          />
          <a
            href="/"
            className="block text-center text-xs text-muted-foreground hover:text-foreground underline"
          >
            跳过，继续匿名使用
          </a>
        </CardContent>
      </Card>
    </div>
  );
}