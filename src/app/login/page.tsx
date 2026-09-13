'use client';

import { useEffect, useState } from 'react';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { Auth } from '@supabase/auth-ui-react';
import { ThemeSupa } from '@supabase/auth-ui-shared';
import { Card, CardContent } from '@/components/ui/card';

export default function LoginPage() {
  const [supabase, setSupabase] = useState<SupabaseClient | null>(null);

  useEffect(() => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (url && anonKey) setSupabase(createClient(url, anonKey));
  }, []);

  useEffect(() => {
    if (!supabase) return;
    const { data: authListener } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_IN' && session?.access_token) {
        await fetch('/api/auth/session', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ accessToken: session.access_token }),
        });
        window.location.href = '/';
      }
    });
    return () => authListener.subscription.unsubscribe();
  }, [supabase]);

  if (!supabase) {
    return (
      <div className="min-h-screen grid place-items-center bg-background p-5">
        <Card><CardContent className="pt-6">认证服务未配置。<a href="/" className="underline">返回</a></CardContent></Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen grid place-items-center bg-background p-5">
      <Card className="w-full max-w-md">
        <CardContent className="pt-6 space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight text-center">
            Forge<span className="text-primary">.</span>
          </h1>
          <p className="text-sm text-muted-foreground text-center mb-4">
            注册保存你的应用，或登录已有账户。
          </p>
          <Auth
            supabaseClient={supabase}
            appearance={{ theme: ThemeSupa }}
            view="sign_in"
            showLinks
            providers={[]}
            redirectTo="/"
          />
          <a href="/" className="block text-center text-xs text-muted-foreground hover:text-foreground mt-4 underline">
            跳过，继续匿名使用
          </a>
        </CardContent>
      </Card>
    </div>
  );
}
