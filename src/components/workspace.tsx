'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { AGENT_NAMES, AGENT_ROLE_LABELS, type AgentHandle } from '../domain/roles.ts';
import type { StreamEvent } from '../domain/events.ts';
import { decodeEvents } from '../transport/sse.ts';

/** One file in the workspace tree: planned (gray), writing, or done. */
interface FileEntry {
  toolCallId: string;
  path: string | null;
  bytes: number | null;
  state: 'planned' | 'writing' | 'done';
}

/** One pipeline step the orchestrator ran (install / build / start / fix). */
interface StepEntry {
  step: string;
  url?: string;
  attempt?: number;
  error?: string;
}

/** One assistant turn, assembled from the event stream. */
interface AgentMessage {
  kind: 'agent';
  messageId: string;
  agentHandle: AgentHandle;
  text: string;
  files: FileEntry[];
  steps: StepEntry[];
  errors: string[];
  /** Set when agent_done arrives — gates the 本轮 summary line. */
  finished: boolean;
}

interface UserMessage {
  kind: 'user';
  messageId: string;
  text: string;
}

type Message = AgentMessage | UserMessage;

/**
 * `tool_input_delta` carries fragments of the tool's JSON arguments. The path
 * shows up early in that JSON, so pulling it out as soon as it is complete lets
 * the UI name the file while the content is still streaming.
 */
function extractPath(argsSoFar: string): string | null {
  const match = /"path"\s*:\s*"((?:[^"\\]|\\.)*)"/.exec(argsSoFar);
  if (!match?.[1]) return null;
  try {
    return JSON.parse(`"${match[1]}"`) as string;
  } catch {
    return null;
  }
}

/**
 * A tiny zero-dependency highlighter: escape everything first, then color
 * comments, strings, and common keywords for ts/tsx/css/json/html files.
 * Deliberately not a real tokenizer — good enough to read code by.
 * Input is ESCAPED before any span is inserted, so the spans themselves
 * are the only HTML in the output.
 */
function highlight(source: string, path: string): string {
  const esc = source.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const lang = /\.css$/.test(path) ? 'css' : /\.json$/.test(path) ? 'json' : /\.html$/.test(path) ? 'html' : 'ts';
  const keywords =
    lang === 'css'
      ? 'important'
      : lang === 'json'
        ? 'true|false|null'
        : 'const|let|var|function|return|if|else|for|while|import|from|export|default|type|interface|extends|new|async|await|class|try|catch|switch|case|break|null|undefined|true|false';
  return esc
    .replace(/(&quot;|"|')(?:\\.|(?!\1)[^\\\n])*\1/g, (m) => `<span class="tok-str">${m}</span>`)
    .replace(/\/\/[^\n]*/g, (m) => `<span class="tok-com">${m}</span>`)
    .replace(/\/\*[\s\S]*?\*\//g, (m) => `<span class="tok-com">${m}</span>`)
    .replace(new RegExp(`\\b(${keywords})\\b`, 'g'), (m) => `<span class="tok-kw">${m}</span>`);
}

/** "4 个文件 · 已完成 1 · 正在写第 2 个" — real progress, not a fake bar. */
function progressText(files: FileEntry[]): string {
  const done = files.filter((f) => f.state === 'done').length;
  const writingIndex = files.findIndex((f) => f.state === 'writing');
  const writing =
    writingIndex === -1 ? '' : ` · 正在写第 ${writingIndex + 1} 个`;
  return `${files.length} 个文件 · 已完成 ${done}${writing}`;
}

export function Workspace() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [log, setLog] = useState<string[]>([]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [fatal, setFatal] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewNonce, setPreviewNonce] = useState(0);
  const [stopped, setStopped] = useState(false);
  const [gateFinding, setGateFinding] = useState<{ code: string; detail: string } | null>(null);
  const [identity, setIdentity] = useState<string | null>(null);
  // 升级是匿名身份唯一的保存路径——首次预览出现时主动邀请，而不是
  // 把它埋在顶栏小按钮里等人发现。
  const [saveInvite, setSaveInvite] = useState(false);
  const [saveEmail, setSaveEmail] = useState('');
  const [savePassword, setSavePassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [upgraded, setUpgraded] = useState(false);
  // 已有账户的再登录（升级时设过密码的用户，换设备/清缓存后用）
  const [showLogin, setShowLogin] = useState(false);
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loggingIn, setLoggingIn] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [pane, setPane] = useState<'preview' | 'code'>('preview');
  const [previewOpen, setPreviewOpen] = useState(false);
  const [codeFiles, setCodeFiles] = useState<string[]>([]);
  const [codeFile, setCodeFile] = useState<{ path: string; content: string } | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const [device, setDevice] = useState<'desktop' | 'tablet' | 'mobile'>('desktop');
  // The workspace file tree — skeleton-first: filled by plan_ready, then each
  // row moves planned → writing → done as Alex works. Keyed by path so plan
  // rows and write events meet regardless of message boundaries.
  const [planFiles, setPlanFiles] = useState<FileEntry[]>([]);

  // One session for the lifetime of the tab. Persisting it is ticket 07's job.
  // Stable initial value — Date.now()/Math.random() in render causes
  // hydration mismatches (SSR renders once, client again). The real id is
  // assigned client-side in the identity effect below.
  const sessionIdRef = useRef<string>('');
  // Raw tool arguments per call id, so a path can be recovered mid-stream.
  const toolArgsRef = useRef(new Map<string, string>());

  const applyEvent = useCallback((event: StreamEvent) => {
    setLog((prev) => [...prev, JSON.stringify(event)]);

    // Side effects happen OUTSIDE the state updater. React StrictMode
    // double-invokes updaters in development; mutating refs or setting other
    // state inside one would run twice and corrupt the buffered tool args.
    if (event.type === 'tool_call_start') {
      toolArgsRef.current.set(event.toolCallId, '');
    } else if (event.type === 'tool_input_delta') {
      const buffered =
        (toolArgsRef.current.get(event.toolCallId) ?? '') + event.argsDelta;
      toolArgsRef.current.set(event.toolCallId, buffered);
      // Skeleton-first: name the row the moment the path parses out of the
      // streaming args, and mark it writing.
      const path = extractPath(buffered);
      if (path) {
        setPlanFiles((prev) => {
          const known = prev.some((f) => f.path === path);
          return known
            ? prev.map((f) => (f.path === path ? { ...f, state: 'writing' } : f))
            : [
                ...prev,
                {
                  toolCallId: event.toolCallId,
                  path,
                  bytes: null,
                  state: 'writing' as const,
                },
              ];
        });
      }
    } else if (event.type === 'run_step' && event.step === 'preview_ready' && event.url) {
      // Same URL every turn — the nonce remounts the iframe so the preview
      // actually refreshes to the new build.
      setPreviewUrl(event.url);
      setPreviewNonce((n) => n + 1);
      maybeOfferSave();
    } else if (event.type === 'interrupted') {
      setStopped(true);
    } else if (event.type === 'gate_failed') {
      setGateFinding({ code: event.code, detail: event.detail });
    } else if (event.type === 'blocked_credits') {
      const reset = event.resetsAt ? new Date(event.resetsAt) : null;
      const when = reset && !Number.isNaN(reset.getTime())
        ? `明天 ${reset.getHours()} 点恢复`
        : '明天恢复';
      setFatal(`今日额度已用完，${when}。第二天再来，或换个更简单的需求减少消耗。`);
    } else if (event.type === 'plan_ready') {
      // Dedupe by path: a duplicated path in the plan would otherwise
      // inflate the denominator and render two rows that both flip.
      const seen = new Set<string>();
      setPlanFiles(
        event.files
          .filter((path) => (seen.has(path) ? false : seen.add(path)))
          .map((path, i) => ({
            toolCallId: `plan-${i}`,
            path,
            bytes: null,
            state: 'planned' as const,
          })),
      );
    } else if (event.type === 'tool_result') {
      const result = event.result as { path?: string; bytes?: number } | null;
      if (result?.path) {
        setPlanFiles((prev) =>
          prev.map((f) =>
            f.path === result.path
              ? { ...f, state: 'done', bytes: result.bytes ?? f.bytes }
              : f,
          ),
        );
      }
    }

    setMessages((prev) => {
      // Never mutate objects from the previous render — React (especially
      // StrictMode, which Next dev mode enables) double-invokes updater
      // functions. Every branch must return a structurally-new message array
      // with a new object for any message that changed.
      const lastAgentIndex = (() => {
        for (let i = prev.length - 1; i >= 0; i -= 1) {
          if (prev[i]?.kind === 'agent') return i;
        }
        return -1;
      })();

      const updateLast = (fn: (message: AgentMessage) => AgentMessage): Message[] => {
        if (lastAgentIndex === -1) return prev;
        return prev.map((message, index) =>
          index === lastAgentIndex && message.kind === 'agent' ? fn(message) : message,
        );
      };

      switch (event.type) {
        case 'agent_started':
          return [
            ...prev,
            {
              kind: 'agent',
              messageId: event.messageId,
              agentHandle: event.agentHandle,
              text: '',
              files: [],
              steps: [],
              errors: [],
              finished: false,
            },
          ];

        case 'text_delta':
          return updateLast((message) => ({ ...message, text: message.text + event.delta }));

        case 'tool_call_start':
          return updateLast((message) => ({
            ...message,
            files: [
              ...message.files,
              { toolCallId: event.toolCallId, path: null, bytes: null, state: 'writing' },
            ],
          }));

        case 'tool_input_delta': {
          const buffered = toolArgsRef.current.get(event.toolCallId) ?? '';
          const path = extractPath(buffered);
          if (!path) return prev;
          return updateLast((message) => ({
            ...message,
            files: message.files.map((file) =>
              file.toolCallId === event.toolCallId && file.path === null
                ? { ...file, path }
                : file,
            ),
          }));
        }
        case 'tool_result': {
          const result = event.result as { path?: string; bytes?: number } | null;
          return updateLast((message) => ({
            ...message,
            files: message.files.map((file) =>
              file.toolCallId === event.toolCallId
                ? {
                    ...file,
                    state: 'done' as const,
                    path: result?.path ?? file.path,
                    bytes: result?.bytes ?? file.bytes,
                  }
                : file,
            ),
          }));
        }

        case 'run_step': {
          const entry: StepEntry = {
            step: event.step,
            ...(event.url !== undefined ? { url: event.url } : {}),
            ...(event.attempt !== undefined ? { attempt: event.attempt } : {}),
            ...(event.error !== undefined ? { error: event.error } : {}),
          };
          return updateLast((message) => ({
            ...message,
            steps: [...message.steps, entry],
          }));
        }

        case 'error':
          return updateLast((message) => ({
            ...message,
            errors: [...message.errors, event.message],
          }));

        case 'agent_done':
          return updateLast((message) => ({ ...message, finished: true }));

        default:
          // Transient progress events are logged but have no home in the
          // message list until later tickets render them.
          return prev;
      }
    });
  }, []);

  const openCodePane = useCallback(async () => {
    setPane('code');
    setCodeFile(null);
    try {
      const res = await fetch(`/api/files?session=${encodeURIComponent(sessionIdRef.current)}`);
      const data = (await res.json()) as { files?: string[]; error?: string };
      setCodeFiles(data.files ?? []);
    } catch {
      setCodeFiles([]);
    }
  }, []);

  const openFile = useCallback(async (path: string) => {
    try {
      const res = await fetch(
        `/api/files?session=${encodeURIComponent(sessionIdRef.current)}&path=${encodeURIComponent(path)}`,
      );
      const data = (await res.json()) as { content?: string; error?: string };
      if (typeof data.content === 'string') setCodeFile({ path, content: data.content });
    } catch {
      /* leave the previous file shown */
    }
  }, []);

  // Silent anonymous sign-in on mount: zero forms, zero clicks. The server
  // validates and sets the httpOnly cookie the generate route trusts.
  useEffect(() => {
    void (async () => {
      try {
        const { createClient } = await import('@supabase/supabase-js');
        const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
        const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
        if (!url || !anonKey) {
          // Dev without a platform project: X-Dev-Session keeps local flows alive.
          // Persist the dev id — a fresh random per load would orphan the
          // workspace on every refresh in exactly the way we just fixed
          // server-side.
          let devId = localStorage.getItem('forge-dev-session');
          if (!devId) {
            devId = `dev-${Math.random().toString(36).slice(2, 8)}`;
            localStorage.setItem('forge-dev-session', devId);
          }
          sessionIdRef.current = devId;
          setIdentity(devId);
          return;
        }
        const supabase = createClient(url, anonKey);
        // Reuse the persisted session first — a blind signInAnonymously on
        // every load mints a NEW anonymous user each time, orphaning the
        // previous workspace. supabase-js persists sessions in localStorage.
        const existing = await supabase.auth.getSession();
        if (!existing.data.session) {
          // 无会话 = 大多数情况是陌生新访客：静默匿名开始，零摩擦是根基。
          // 换设备回来的老用户走空状态里的「登录已有账户」链接。
          const fresh = await supabase.auth.signInAnonymously();
          if (fresh.data.session?.access_token && fresh.data.user) {
            sessionIdRef.current = fresh.data.user.id;
            setIdentity(fresh.data.user.id);
            await fetch('/api/auth/session', {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ accessToken: fresh.data.session.access_token }),
            });
          }
          return;
        }
        const session = existing.data.session;
        if (session?.access_token && session.user) {
          const data = { session, user: session.user };
          await fetch('/api/auth/session', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ accessToken: session.access_token }),
          });
          sessionIdRef.current = session.user.id;
          const id = session.user.id;
          setIdentity(id);

          // Returning visitor: if this workspace already has an app, bring
          // the preview and file tree back instead of a blank page.
          try {
            const res = await fetch('/api/preview');
            if (res.ok) {
              const data2 = (await res.json()) as { url?: string; files?: string[] };
              if (data2.url) {
                maybeOfferSave();
                setPreviewUrl(data2.url);
                setPreviewNonce((n) => n + 1);
                setPreviewOpen(true);
                if (data2.files && data2.files.length > 0) {
                  setPlanFiles(
                    data2.files
                      .filter((f) => f.startsWith('src/'))
                      .map((path, i) => ({
                        toolCallId: `restored-${i}`,
                        path,
                        bytes: null,
                        state: 'done' as const,
                      })),
                  );
                }
              }
            }
          } catch {
            /* first visit or nothing generated — fine */
          }
        }
      } catch {
        setIdentity(null);
      }
    })();
  }, []);

  const loginExisting = useCallback(async () => {
    setLoggingIn(true);
    setLoginError(null);
    try {
      const { createClient } = await import('@supabase/supabase-js');
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      );
      const { data, error } = await supabase.auth.signInWithPassword({
        email: loginEmail,
        password: loginPassword,
      });
      if (error || !data.session) {
        setLoginError(error?.message ?? '登录失败，请检查邮箱和密码。');
        return;
      }
      setShowLogin(false);
      sessionIdRef.current = data.user.id;
      setIdentity(data.user.id);
      await fetch('/api/auth/session', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ accessToken: data.session.access_token }),
      });
      // 登录后走同一个找回预览的路径
      try {
        const res = await fetch('/api/preview');
        if (res.ok) {
          const d = (await res.json()) as { url?: string; files?: string[] };
          if (d.url) {
            maybeOfferSave();
            setPreviewUrl(d.url);
            setPreviewNonce((n) => n + 1);
            setPreviewOpen(true);
            if (d.files?.length) {
              setPlanFiles(
                d.files
                  .filter((f) => f.startsWith('src/'))
                  .map((path, i) => ({
                    toolCallId: `login-${i}`,
                    path,
                    bytes: null,
                    state: 'done' as const,
                  })),
              );
            }
          }
        }
      } catch { /* nothing to restore — fine */ }
    } finally {
      setLoggingIn(false);
    }
  }, [loginEmail, loginPassword]);

  const startAnonymous = useCallback(async () => {
    setShowLogin(false);
    const { createClient } = await import('@supabase/supabase-js');
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    );
    const { data } = await supabase.auth.signInAnonymously();
    if (data.session?.access_token && data.user) {
      sessionIdRef.current = data.user.id;
      setIdentity(data.user.id);
      await fetch('/api/auth/session', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ accessToken: data.session.access_token }),
      });
    }
  }, []);

  const maybeOfferSave = useCallback(() => {
    if (typeof window === 'undefined') return;
    if (localStorage.getItem('forge-save-dismissed')) return;
    // Dev 降级身份没有 Supabase，升级端点会 503——不出邀请。
    if (identity?.startsWith('dev-')) return;
    setSaveInvite(true);
  }, [identity]);

  const submitSave = useCallback(async () => {
    if (!saveEmail.includes('@') || savePassword.length < 6) return;
    setSaving(true);
    try {
      const res = await fetch('/api/auth/upgrade', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: saveEmail, password: savePassword }),
      });
      if (res.ok) {
        setUpgraded(true);
        setSaveInvite(false);
        localStorage.setItem('forge-save-dismissed', '1');
      } else {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        window.alert(data?.error ?? '升级失败，请稍后再试。');
      }
    } finally {
      setSaving(false);
    }
  }, [saveEmail]);

  const submit = useCallback(async () => {
    const message = input.trim();
    if (message.length === 0 || streaming) return;
    if (!sessionIdRef.current) return; // identity still connecting

    setInput('');
    setFatal(null);
    // Each turn gets a fresh tree: turn-1 rows must not bleed into turn-2's
    // progress (iterate turns build their rows from writes alone).
    setPlanFiles([]);
    setStreaming(true);
    setMessages((prev) => [
      ...prev,
      { kind: 'user', messageId: `u-${prev.length}`, text: message },
    ]);

    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const response = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ message }),
        signal: controller.signal,
        ...(identity?.startsWith('dev-')
          ? { headers: { 'content-type': 'application/json', 'x-dev-session': sessionIdRef.current } }
          : {}),
      });

      if (!response.ok || !response.body) {
        const detail = (await response.json().catch(() => null)) as { error?: string } | null;
        setFatal(detail?.error ?? `Request failed with ${response.status}.`);
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const { events, rest } = decodeEvents(buffer);
        buffer = rest;
        for (const event of events) applyEvent(event);
      }
    } catch (error) {
      if (!controller.signal.aborted) {
        setFatal(error instanceof Error ? error.message : String(error));
      }
    } finally {
      setStreaming(false);
    }
  }, [applyEvent, input, streaming]);

  return (
    <div className="frame">
      <div className="topbar">
        <div className="logo">
          Forge<span>.</span>
        </div>
        <div className="spacer" />
        {gateFinding ? <span className="pill err">需要确认</span> : null}
        {stopped && !gateFinding ? <span className="pill">已停止</span> : null}
        {streaming ? <span className="pill run">生成中</span> : null}
        {!streaming && !gateFinding && previewUrl ? (
          <span className="pill ok">运行中</span>
        ) : null}
        {identity ? (
          upgraded ? (
            <span className="pill ok">已绑定邮箱</span>
          ) : (
            <button type="button" className="btn small" onClick={() => setSaveInvite(true)} title={identity}>
              升级保存
            </button>
          )
        ) : (
          <span className="pill">连接中…</span>
        )}
        <button
          type="button"
          className="btn small"
          onClick={() => setPreviewOpen((v) => !v)}
        >
          {previewOpen ? '收起预览' : '预览'}
        </button>
      </div>

      <div className={previewOpen ? 'body' : 'body preview-collapsed'}>
        <section className="chat" aria-label="对话">
          <div className="chat-scroll">
            {messages.length === 0 ? (
              <>
              {showLogin ? (
                <div className="empty">
                  <h1>登录已有账户</h1>
                  <p>登录已保存的账户，找回你的应用；或直接匿名开始一个新的。</p>
                  <div className="login-box">
                    <input
                      type="email"
                      value={loginEmail}
                      onChange={(e) => setLoginEmail(e.target.value)}
                      placeholder="you@example.com"
                      aria-label="邮箱"
                    />
                    <input
                      type="password"
                      value={loginPassword}
                      onChange={(e) => setLoginPassword(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') void loginExisting(); }}
                      placeholder="密码"
                      aria-label="密码"
                    />
                    {loginError ? <div className="login-err">{loginError}</div> : null}
                    <div className="save-row">
                      <button
                        type="button"
                        className="btn primary"
                        disabled={loggingIn || !loginEmail.includes('@') || loginPassword.length < 6}
                        onClick={() => void loginExisting()}
                      >
                        {loggingIn ? '登录中…' : '登录'}
                      </button>
                      <button type="button" className="btn" onClick={() => void startAnonymous()}>
                        直接开始（匿名）
                      </button>
                    </div>
                  </div>
                </div>
              ) : null}
              {!showLogin ? (
              <div className="empty">
                <h1>想做点什么？</h1>
                <p className="returning-link">
                  <button type="button" className="linklike" onClick={() => setShowLogin(true)}>
                    换设备了？登录已有账户
                  </button>
                </p>
                <p>
                  描述你想要的网站或工具，Alex 会把它建出来。
                  <br />
                  不需要写代码，也不需要注册。
                </p>
                <div className="examples">
                  {[
                    ['📔', '记录每日心情的应用', '日期、心情等级、备注，数据存在浏览器里'],
                    ['✅', '一个待办清单', '可增删、可标记完成、可筛选'],
                    ['⏱️', '番茄钟计时器', '25 分钟倒计时、专注历史记录'],
                  ].map(([icon, title, sub]) => (
                    <button
                      type="button"
                      key={title}
                      onClick={() => {
                        setInput(`做一个${title}：${sub}`);
                        document.querySelector<HTMLTextAreaElement>('textarea')?.focus();
                      }}
                    >
                      <span className="ex-icon">{icon}</span>
                      <span>
                        {title}
                        <small>{sub}</small>
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            {messages.map((message) =>
              message.kind === 'user' ? (
                <div className="msg me" key={message.messageId}>
                  <div className="who">
                    <span className="av me">你</span>你
                  </div>
                  <div className="bub">{message.text}</div>
                </div>
              ) : (
                <div className="msg" key={message.messageId}>
                  <div className="who">
                    <span className={`av ${message.agentHandle}`}>
                      {AGENT_NAMES[message.agentHandle].charAt(0)}
                    </span>
                    {AGENT_NAMES[message.agentHandle]} · {AGENT_ROLE_LABELS[message.agentHandle]}
                  </div>

                  {message.text ? <div className="bub">{message.text}</div> : null}

                  {message.files.map((file) => (
                    <div className={`file-line ${file.state}`} key={file.toolCallId}>
                      <span className="status">{file.state === 'done' ? '✓' : '▶'}</span>
                      <span>{file.path ?? '准备写入…'}</span>
                      {file.bytes !== null ? <span className="size">{file.bytes}B</span> : null}
                    </div>
                  ))}

                  {message.steps.map((step, index) =>
                    step.step === 'autofixing' ? (
                      <div className="fix-note" key={`${message.messageId}-s${index}`}>
                        <div className="fix-head">
                          ⚠ 出了点问题，Alex 正在自己修（第 {step.attempt} 次）
                        </div>
                        {step.error ? (
                          <details className="fix-detail">
                            <summary>查看详情</summary>
                            <pre>{step.error}</pre>
                          </details>
                        ) : null}
                      </div>
                    ) : (
                      <div
                        className={`file-line ${step.step === 'preview_ready' ? 'done' : 'writing'}`}
                        key={`${message.messageId}-s${index}`}
                      >
                        <span className="status">{step.step === 'preview_ready' ? '✓' : '▶'}</span>
                        <span>
                          {step.step === 'installing' && '安装依赖 npm install'}
                          {step.step === 'migrating' && '数据库迁移与安全检查'}
                          {step.step === 'building' && '构建 npm run build'}
                          {step.step === 'starting' && '启动开发服务器'}
                          {step.step === 'preview_ready' && '预览就绪'}
                        </span>
                      </div>
                    ),
                  )}

                  {message.finished && message.agentHandle === 'eng' && message.files.length > 0 ? (
                    <div className="turn-summary">
                      本轮改了 {message.files.length} 个文件：
                      {message.files.map((f) => f.path).filter(Boolean).join('、')}
                    </div>
                  ) : null}

                  {message.errors.map((error, index) => (
                    <div className="bub error" key={`${message.messageId}-e${index}`}>
                      {error}
                    </div>
                  ))}
                </div>
              ),
            )}


            {saveInvite && !upgraded ? (
              <div className="save-invite">
                <div className="save-title">🎉 应用跑起来了 —— 想保住它吗？</div>
                <p className="save-note">
                  匿名身份清了缓存就没了。留个邮箱和密码，升级成永久账户，换设备也能找回这个应用。
                </p>
                <div className="save-row">
                  <input
                    type="email"
                    value={saveEmail}
                    onChange={(e) => setSaveEmail(e.target.value)}
                    placeholder="you@example.com"
                    aria-label="邮箱"
                  />
                  <input
                    type="password"
                    value={savePassword}
                    onChange={(e) => setSavePassword(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') void submitSave();
                    }}
                    placeholder="密码（至少 6 位，下次登录用）"
                    aria-label="密码"
                  />
                  <button
                    type="button"
                    className="btn primary"
                    disabled={saving || !saveEmail.includes('@') || savePassword.length < 6}
                    onClick={() => void submitSave()}
                  >
                    {saving ? '保存中…' : '保住它'}
                  </button>
                  <button
                    type="button"
                    className="btn"
                    onClick={() => {
                      setSaveInvite(false);
                      localStorage.setItem('forge-save-dismissed', '1');
                    }}
                  >
                    以后再说
                  </button>
                </div>
              </div>
              ) : null}
              </>
            ) : null}

            {planFiles.length > 0 ? (
              <div className="files-card">
                <div className="files-header">{progressText(planFiles)}</div>
                {planFiles.map((file) => (
                  <div className={`file-line ${file.state}`} key={file.toolCallId}>
                    <span className="status">
                      {file.state === 'done' ? '✓' : file.state === 'writing' ? '▶' : '·'}
                    </span>
                    <span>{file.path}</span>
                    {file.bytes !== null ? <span className="size">{file.bytes}B</span> : null}
                    {file.state === 'planned' ? <span className="size">待生成</span> : null}
                  </div>
                ))}
              </div>
            ) : null}

            {log.length > 0 ? (
              <details className="activity">
                <summary>▸ 活动日志 · {log.length} 条</summary>
                <div className="log">
                  {log.map((line, index) => (
                    <div key={index}>{line}</div>
                  ))}
                </div>
              </details>
            ) : null}

            {fatal ? <div className="bub error">{fatal}</div> : null}
          </div>

          <div className="composer">
            <textarea
              maxLength={4000}
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
                  event.preventDefault();
                  void submit();
                }
              }}
              placeholder="描述你想做的东西…"
              aria-label="描述你想做的东西"
              disabled={streaming}
            />
            {gateFinding ? (
              <div className="gate-card">
                <h4>⚠ 安全检查未通过</h4>
                <p>
                  检测到一条过宽的数据访问策略，<strong>已回滚，未对外暴露任何数据</strong>。
                  Alex 会重写这部分 —— 安全问题不自动重试，需要你确认后继续。
                </p>
                <details className="fix-detail">
                  <summary>查看详情</summary>
                  <pre>
                    {gateFinding.code}
                    {'\n'}
                    {gateFinding.detail}
                  </pre>
                </details>
                <div className="row">
                  <button
                    type="button"
                    className="btn primary"
                    onClick={() => {
                      setGateFinding(null);
                      setInput('让 Alex 重写');
                      document.querySelector<HTMLTextAreaElement>('textarea')?.focus();
                    }}
                  >
                    让 Alex 重写
                  </button>
                </div>
              </div>
            ) : null}

            {stopped ? (
              <div className="stopped-banner">
                <span>已停止 —— 已生成的文件都保留了。</span>
                <div className="stopped-actions">
                  <button
                    type="button"
                    className="btn primary"
                    onClick={() => {
                      setStopped(false);
                      document.querySelector<HTMLTextAreaElement>('textarea')?.focus();
                    }}
                  >
                    继续刚才的
                  </button>
                  <button
                    type="button"
                    className="btn"
                    onClick={() => {
                      // 换个方向重来：新会话，对话与预览清空（沙箱文件可保留）
                      sessionIdRef.current = `s-${Date.now()}`;
                      setMessages([]);
                      setPlanFiles([]);
                      setPreviewUrl(null);
                      setStopped(false);
                      setLog([]);
                    }}
                  >
                    换个方向重来
                  </button>
                </div>
              </div>
            ) : null}
            <div className="composer-row">
              {streaming ? (
                <button type="button" className="btn danger" onClick={() => abortRef.current?.abort()}>
                  ■ 停止
                </button>
              ) : (
                <button
                  type="button"
                  className="btn primary"
                  onClick={() => void submit()}
                  disabled={input.trim().length === 0}
                >
                  开始
                </button>
              )}
              <span className="spacer" />
              <span className="pill">⌘↩ 发送</span>
            </div>
          </div>
        </section>

        <section className="preview" aria-label="预览">
          <div className="preview-bar">
            <button
              type="button"
              className={`btn small ${pane === 'preview' ? 'primary' : ''}`}
              onClick={() => setPane('preview')}
            >
              预览
            </button>
            <button
              type="button"
              className={`btn small ${pane === 'code' ? 'primary' : ''}`}
              onClick={() => void openCodePane()}
            >
              代码
            </button>
            {pane === 'preview' ? (
              <>
            <button
              type="button"
              className={`btn small ${device === 'desktop' ? 'primary' : ''}`}
              onClick={() => setDevice('desktop')}
            >
              桌面
            </button>
            <button
              type="button"
              className={`btn small ${device === 'tablet' ? 'primary' : ''}`}
              onClick={() => setDevice('tablet')}
            >
              平板
            </button>
            <button
              type="button"
              className={`btn small ${device === 'mobile' ? 'primary' : ''}`}
              onClick={() => setDevice('mobile')}
            >
              手机
            </button>
              </>
            ) : null}
            <div className="spacer" />
            {identity ? (
              <a
                className="btn small"
                href={`/api/export?session=${encodeURIComponent(sessionIdRef.current)}`}
                download
              >
                导出 zip
              </a>
            ) : null}
            {previewUrl ? (
              <a className="pill" href={previewUrl} target="_blank" rel="noopener noreferrer">
                ↗ 新标签页
              </a>
            ) : (
              <span className="pill">尚未生成</span>
            )}
          </div>
          <div className="preview-stage">
            {pane === 'code' ? (
              <div className="code-viewer">
                <div className="code-tree">
                  {codeFiles.length === 0 ? (
                    <div className="code-empty">还没有生成文件</div>
                  ) : (
                    codeFiles.map((f) => (
                      <button
                        type="button"
                        key={f}
                        className={`code-tree-item ${codeFile?.path === f ? 'active' : ''}`}
                        onClick={() => void openFile(f)}
                      >
                        {f}
                      </button>
                    ))
                  )}
                </div>
                <div className="code-content">
                  {codeFile ? (
                    <>
                      <div className="code-path">{codeFile.path} · 只读</div>
                      <pre className="code-body">
                        <code dangerouslySetInnerHTML={{ __html: highlight(codeFile.content, codeFile.path) }} />
                      </pre>
                    </>
                  ) : (
                    <div className="code-empty">选择左侧文件查看内容</div>
                  )}
                </div>
              </div>
            ) : previewUrl ? (
              <div className={`device device-${device}`}>
                <iframe
                  key={`${previewUrl}-${previewNonce}`}
                  src={previewUrl}
                  title="应用预览"
                  className="preview-frame"
                />
              </div>
            ) : (
              <span>预览会在应用能跑起来之后出现</span>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
