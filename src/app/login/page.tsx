'use client';

import { useCallback, useState } from 'react';

import { createClient } from '@supabase/supabase-js';

/**
 * /login — 标准的注册/登录页面。
 *
 * 替代之前内联在聊天区的"保存邀请卡"。标准做法：
 * 专用路由 + 标准表单 + 成功后跳回工作区。
 */
export default function LoginPage() {
  const [mode, setMode] = useState<'signup' | 'signin'>('signup');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = useCallback(async () => {
    if (!email.includes('@') || password.length < 6) return;
    setLoading(true);
    setError(null);

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !anonKey) {
      setError('认证服务未配置。');
      setLoading(false);
      return;
    }

    const supabase = createClient(url, anonKey);

    const { data, error: authError } =
      mode === 'signup'
        ? await supabase.auth.signUp({ email, password })
        : await supabase.auth.signInWithPassword({ email, password });

    if (authError) {
      setError(authError.message);
      setLoading(false);
      return;
    }

    if (data.session?.access_token && data.user) {
      // 设置 httpOnly cookie（服务端验证用）
      await fetch('/api/auth/session', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ accessToken: data.session.access_token }),
      });
      // 回到工作区
      window.location.href = '/';
      return;
    }

    setLoading(false);
  }, [email, password, mode]);

  return (
    <div className="login-page">
      <div className="login-card">
        <h1>{mode === 'signup' ? '创建账户' : '登录'}</h1>
        <p className="login-sub">
          {mode === 'signup'
            ? '保存你的应用，换设备也能找回。'
            : '欢迎回来。'}
        </p>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            aria-label="邮箱"
            autoComplete="email"
            required
          />
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="密码（至少 6 位）"
            aria-label="密码"
            autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
            minLength={6}
            required
          />
          {error ? <div className="login-error">{error}</div> : null}
          <button type="submit" className="btn primary" disabled={loading}>
            {loading ? '请稍候…' : mode === 'signup' ? '注册' : '登录'}
          </button>
        </form>

        <button
          type="button"
          className="linklike"
          onClick={() => setMode(mode === 'signup' ? 'signin' : 'signup')}
        >
          {mode === 'signup' ? '已有账户？登录' : '没有账户？注册'}
        </button>

        <a href="/" className="login-skip">跳过，继续匿名使用</a>
      </div>
    </div>
  );
}
