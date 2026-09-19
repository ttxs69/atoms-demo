'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '@/components/ui/collapsible';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { AGENT_NAMES, AGENT_ROLE_LABELS, type AgentHandle } from '../domain/roles.ts';
import type { StreamEvent } from '../domain/events.ts';
import type { JournalRecord } from '../journal/fold.ts';
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
    .replace(/(&quot;|"|')(?:\\.|(?!\1)[^\\\n])*\1/g, (m) => `<span class="text-emerald-600 dark:text-emerald-400">${m}</span>`)
    .replace(/\/\/[^\n]*/g, (m) => `<span class="text-zinc-500 italic">${m}</span>`)
    .replace(/\/\*[\s\S]*?\*\//g, (m) => `<span class="text-zinc-500 italic">${m}</span>`)
    .replace(new RegExp(`\\b(${keywords})\\b`, 'g'), (m) => `<span class="text-sky-600 dark:text-sky-400 font-medium">${m}</span>`);
}

/** "4 个文件 · 已完成 1 · 正在写第 2 个" — real progress, not a fake bar. */
function progressText(files: FileEntry[]): string {
  const done = files.filter((f) => f.state === 'done').length;
  const writingIndex = files.findIndex((f) => f.state === 'writing');
  const writing =
    writingIndex === -1 ? '' : ` · 正在写第 ${writingIndex + 1} 个`;
  return `${files.length} 个文件 · 已完成 ${done}${writing}`;
}

/** Folded journal records → the same Message list the live stream builds. */
function recordsToMessages(records: JournalRecord[]): Message[] {
  const out: Message[] = [];
  records.forEach((record, i) => {
    if (record.kind === 'user_message') {
      out.push({ kind: 'user', messageId: record.messageId ?? `ru-${i}`, text: record.text });
    } else if (record.kind === 'agent_message') {
      out.push({
        kind: 'agent',
        messageId: record.messageId ?? `ra-${i}`,
        agentHandle: record.agentHandle as AgentHandle,
        text: record.text,
        files: record.files.map((f, j) => ({
          toolCallId: `r-${i}-${j}`,
          path: f.path,
          bytes: f.bytes,
          state: 'done' as const,
        })),
        steps: [], // transient by contract — steps do not replay
        errors: record.errors,
        finished: !record.aborted,
      });
    }
  });
  return out;
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
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [upgraded, setUpgraded] = useState(false);
  const [pane, setPane] = useState<'preview' | 'code'>('preview');
  const [previewOpen, setPreviewOpen] = useState(false);
  const [codeFiles, setCodeFiles] = useState<string[]>([]);
  const [codeFile, setCodeFile] = useState<{ path: string; content: string } | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const [device, setDevice] = useState<'desktop' | 'tablet' | 'mobile'>('desktop');
  const [planFiles, setPlanFiles] = useState<FileEntry[]>([]);

  const sessionIdRef = useRef<string>('');
  const toolArgsRef = useRef(new Map<string, string>());
  const projectIdRef = useRef<string | null>(null);

  const applyEvent = useCallback((event: StreamEvent) => {
    setLog((prev) => [...prev, JSON.stringify(event)]);

    if (event.type === 'tool_call_start') {
      toolArgsRef.current.set(event.toolCallId, '');
    } else if (event.type === 'tool_input_delta') {
      const buffered =
        (toolArgsRef.current.get(event.toolCallId) ?? '') + event.argsDelta;
      toolArgsRef.current.set(event.toolCallId, buffered);
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
      setPreviewUrl(event.url);
      setPreviewNonce((n) => n + 1);
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

  // Silent anonymous sign-in on mount. After 4s without identity, fall back
  // to dev mode — if Supabase is down or unreachable, users still see a
  // working app instead of hanging on "连接中".
  useEffect(() => {
    // Preview/workspace restore runs for EVERY resolved real identity —
    // returning logged-in users (via /api/auth/me) get their preview back
    // exactly like anonymous users with an existing session do.
    const restoreWorkspace = async (): Promise<void> => {
      // `?new=1`（＋新建项目）：新开始不回旧预览——与水合门控同规则。
      if (new URLSearchParams(window.location.search).get('new') === '1') return;
      try {
        const res = await fetch('/api/preview');
        if (res.ok) {
          const data = (await res.json()) as { url?: string; files?: string[] };
          if (data.url) {
            setPreviewUrl(data.url);
            setPreviewNonce((n) => n + 1);
            setPreviewOpen(true);
            if (data.files && data.files.length > 0) {
              setPlanFiles(
                data.files
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
    };

    // First: check if logged-in user exists (cookie-based)
    void (async () => {
      try {
        const res = await fetch('/api/auth/me');
        const data = (await res.json()) as { user: { id: string; email: string } | null };
        if (data.user) {
          sessionIdRef.current = data.user.id;
          setIdentity(data.user.id);
          setUserEmail(data.user.email);
          await restoreWorkspace(); // 回归用户同样找回 workspace
          return; // 已登录，不走 anonymous 流程
        }
      } catch {
        /* not logged in, continue anonymous */
      }

      // Anonymous 登录流程
      try {
        const { createClient } = await import('@supabase/supabase-js');
        // 匿名登录也走 APPS（auth + projects 同源）
        const url = process.env['NEXT_PUBLIC_APPS_SUPABASE_URL'];
        const anonKey = process.env['NEXT_PUBLIC_APPS_SUPABASE_PUBLISHABLE_KEY'];
        if (!url || !anonKey) {
          // env 没设——dev fallback
          let devId = localStorage.getItem('forge-dev-session');
          if (!devId) {
            devId = `dev-${Math.random().toString(36).slice(2, 8)}`;
            localStorage.setItem('forge-dev-session', devId);
          }
          sessionIdRef.current = devId;
          setIdentity(devId);
          await fetch('/api/auth/session', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ accessToken: devId }),
          }).catch(() => {});
          return;
        }
        const supabase = createClient(url, anonKey);
        const existing = await supabase.auth.getSession();
        if (!existing.data.session) {
          const fresh = await supabase.auth.signInAnonymously();
          if (fresh.data.session?.access_token && fresh.data.user) {
            sessionIdRef.current = fresh.data.user.id;
            setIdentity(fresh.data.user.id);
            const { turnstileToken } = await import('../auth/turnstile-client.ts');
            const tsToken = await turnstileToken();
            await fetch('/api/auth/session', {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({
                accessToken: fresh.data.session.access_token,
                ...(tsToken ? { turnstileToken: tsToken } : {}),
              }),
            });
          } else {
            // signInAnonymously 失败 → dev fallback
            throw new Error('signInAnonymously no session');
          }
          return;
        }
        const session = existing.data.session;
        if (session?.access_token && session.user) {
          await fetch('/api/auth/session', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ accessToken: session.access_token }),
          });
          sessionIdRef.current = session.user.id;
          const id = session.user.id;
          setIdentity(id);
          // 恢复 preview
          await restoreWorkspace();
        }
      } catch {
        // Supabase failed → dev fallback
        let devId = localStorage.getItem('forge-dev-session');
        if (!devId) {
          devId = `dev-${Math.random().toString(36).slice(2, 8)}`;
          localStorage.setItem('forge-dev-session', devId);
        }
        sessionIdRef.current = devId;
        setIdentity(devId);
        await fetch('/api/auth/session', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ accessToken: devId }),
        }).catch(() => {});
      }
    })();
  }, []);


  // Hydration (docs/04 §3.2): a real identity owns a projects row — replay
  // the conversation so a refresh starts where the user left off. Dev
  // sessions have nothing persisted, by design. `?new=1` (＋新建项目) opts
  // OUT: a fresh start must not resurrect the old conversation.
  useEffect(() => {
    if (!identity || identity.startsWith('dev-')) return;
    if (new URLSearchParams(window.location.search).get('new') === '1') return;
    void (async () => {
      try {
        const res = await fetch('/api/projects');
        if (!res.ok) return;
        const { projects } = (await res.json()) as { projects?: { id: string }[] };
        const active = projects?.[0];
        if (!active) return; // never generated — nothing to replay
        projectIdRef.current = active.id; // bind the workspace to THIS project
        const ev = await fetch(`/api/projects/${active.id}/events`);
        if (!ev.ok) return;
        const { events } = (await ev.json()) as { events?: { payload: JournalRecord }[] };
        const messages = (events ?? []).map((row) => row.payload);
        if (messages.length > 0) setMessages(recordsToMessages(messages));
      } catch {
        /* first visit or persistence unavailable — live stream still works */
      }
    })();
  }, [identity]);

  const signOut = useCallback(async () => {
    await fetch('/api/auth/signout', { method: 'POST' });
    setUserEmail(null);
    window.location.href = '/';
  }, []);

  const submit = useCallback(async () => {
    const message = input.trim();
    if (message.length === 0 || streaming) return;
    if (!sessionIdRef.current) return;

    setInput('');
    setFatal(null);
    setPlanFiles([]);
    setStreaming(true);
    setMessages((prev) => [
      ...prev,
      { kind: 'user', messageId: `u-${prev.length}`, text: message },
    ]);

    // 新建模式（?new=1）：首条消息先建草稿项目再生成——否则路由会挑
    // “最近项目”，把新对话写进旧项目的 journal。常态模式：要么用
    // 水合绑定的 id，要么留空让路由自行解析（保持原行为）。
    const isNew = new URLSearchParams(window.location.search).get('new') === '1';
    if (isNew && !projectIdRef.current && !identity?.startsWith('dev-')) {
      try {
        const res = await fetch('/api/projects', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ name: message.slice(0, 24) || '未命名项目' }),
        });
        const { project } = (await res.json()) as { project?: { id: string } };
        if (project) projectIdRef.current = project.id;
      } catch {
        /* fall through: route resolves most-recent (old behavior) */
      }
    }

    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const response = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          message,
          ...(projectIdRef.current ? { projectId: projectIdRef.current } : {}),
        }),
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
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      {/* Topbar */}
      <header className="border-b bg-background/95 backdrop-blur sticky top-0 z-10">
        <div className="flex items-center gap-2 px-4 h-12">
          <div className="text-base font-semibold tracking-tight">
            Forge<span className="text-primary">.</span>
          </div>
          <div className="flex-1" />
          {gateFinding ? <Badge variant="destructive">需要确认</Badge> : null}
          {stopped && !gateFinding ? <Badge variant="secondary">已停止</Badge> : null}
          {streaming ? <Badge variant="default" className="bg-blue-500">生成中</Badge> : null}
          {!streaming && !gateFinding && previewUrl ? (
            <Badge variant="default" className="bg-emerald-500">运行中</Badge>
          ) : null}
          {identity && userEmail ? (
            <DropdownMenu>
              <DropdownMenuTrigger className="inline-flex items-center justify-center size-7 rounded-full bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                {userEmail.charAt(0).toUpperCase()}
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-48">
                <div className="px-2 py-1.5 text-xs text-muted-foreground">
                  {userEmail}
                </div>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => (window.location.href = '/projects')}>
                  我的项目
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => void signOut()}>
                  退出登录
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : identity ? (
            <a
              href="/login"
              title={identity}
              className="inline-flex items-center justify-center rounded-md text-sm font-medium border border-input bg-background hover:bg-accent h-7 px-2.5 transition-colors"
            >
              升级保存
            </a>
          ) : (
            <Badge variant="secondary">连接中…</Badge>
          )}
          <Button
            size="sm"
            variant="outline"
            onClick={() => setPreviewOpen((v) => !v)}
          >
            {previewOpen ? '收起预览' : '预览'}
          </Button>
        </div>
      </header>

      {/* Body: chat + preview */}
      <div className={`flex-1 grid grid-cols-1 min-h-0 ${previewOpen ? 'lg:grid-cols-[1fr_minmax(420px,1fr)]' : ''}`}>
        {/* Chat pane */}
        <section className="flex flex-col min-h-0 border-r" aria-label="对话">
          <div className="flex-1 overflow-y-auto px-4 py-6 space-y-4">
            {messages.length === 0 ? (
              <EmptyState
                onExampleClick={(text) => {
                  setInput(text);
                  const ta = document.querySelector<HTMLTextAreaElement>('textarea[name=composer]');
                  ta?.focus();
                }}
              />
            ) : null}

            {messages.map((message) =>
              message.kind === 'user' ? (
                <UserBubble key={message.messageId} text={message.text} />
              ) : (
                <AgentBubble message={message} />
              ),
            )}

            {planFiles.length > 0 ? <PlanTree files={planFiles} /> : null}

            {log.length > 0 ? (
              <Collapsible>
                <CollapsibleTrigger className="text-xs text-muted-foreground hover:text-foreground transition-colors">
                  ▸ 活动日志 · {log.length} 条
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <pre className="mt-2 p-3 bg-muted rounded-md text-xs font-mono overflow-x-auto max-h-40 overflow-y-auto">
                    {log.map((line, i) => (
                      <div key={i}>{line}</div>
                    ))}
                  </pre>
                </CollapsibleContent>
              </Collapsible>
            ) : null}

            {fatal ? (
              <Alert variant="destructive">
                <AlertDescription>{fatal}</AlertDescription>
              </Alert>
            ) : null}
          </div>

          {/* Composer */}
          <div className="border-t p-3 space-y-3">
            {gateFinding ? (
              <Card>
                <CardContent className="pt-4 space-y-2">
                  <h4 className="text-sm font-semibold text-destructive">⚠ 安全检查未通过</h4>
                  <p className="text-sm text-muted-foreground">
                    检测到一条过宽的数据访问策略，<strong>已回滚，未对外暴露任何数据</strong>。
                    Alex 会重写这部分 —— 安全问题不自动重试，需要你确认后继续。
                  </p>
                  <details className="text-xs">
                    <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                      查看详情
                    </summary>
                    <pre className="mt-2 p-2 bg-muted rounded text-xs overflow-x-auto">
                      {gateFinding.code}
                      {'\n'}
                      {gateFinding.detail}
                    </pre>
                  </details>
                  <Button
                    variant="default"
                    onClick={() => {
                      setGateFinding(null);
                      setInput('让 Alex 重写');
                      document.querySelector<HTMLTextAreaElement>('textarea[name=composer]')?.focus();
                    }}
                  >
                    让 Alex 重写
                  </Button>
                </CardContent>
              </Card>
            ) : null}

            {stopped ? (
              <Alert>
                <AlertDescription className="flex items-center justify-between gap-2">
                  <span>已停止 —— 已生成的文件都保留了。</span>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="default"
                      onClick={() => {
                        setStopped(false);
                        document.querySelector<HTMLTextAreaElement>('textarea[name=composer]')?.focus();
                      }}
                    >
                      继续刚才的
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        sessionIdRef.current = `s-${Date.now()}`;
                        setMessages([]);
                        setPlanFiles([]);
                        setPreviewUrl(null);
                        setStopped(false);
                        setLog([]);
                      }}
                    >
                      换个方向重来
                    </Button>
                  </div>
                </AlertDescription>
              </Alert>
            ) : null}

            <Textarea
              name="composer"
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
              className="min-h-20 resize-none"
            />
            <div className="flex items-center gap-2">
              {streaming ? (
                <Button
                  variant="destructive"
                  onClick={() => {
                    // Optimistic: the server's `interrupted` event is emitted
                    // AFTER this abort reaches it — by then the aborted fetch
                    // no longer delivers events, so the banner must be set
                    // here, not via applyEvent (J4 regression).
                    setStopped(true);
                    abortRef.current?.abort();
                  }}
                >
                  ■ 停止
                </Button>
              ) : (
                <Button
                  variant="default"
                  onClick={() => void submit()}
                  disabled={input.trim().length === 0}
                >
                  开始
                </Button>
              )}
              <div className="flex-1" />
              <Badge variant="secondary">⌘↩ 发送</Badge>
            </div>
          </div>
        </section>

        {/* Preview pane */}
        {previewOpen ? (
          <section className="flex flex-col min-h-0 bg-muted/30" aria-label="预览">
            <div className="flex items-center gap-1 p-2 border-b bg-background">
              <Button
                size="sm"
                variant={pane === 'preview' ? 'default' : 'outline'}
                onClick={() => setPane('preview')}
              >
                预览
              </Button>
              <Button
                size="sm"
                variant={pane === 'code' ? 'default' : 'outline'}
                onClick={() => void openCodePane()}
              >
                代码
              </Button>
              {pane === 'preview' ? (
                <>
                  <Button
                    size="sm"
                    variant={device === 'desktop' ? 'default' : 'outline'}
                    onClick={() => setDevice('desktop')}
                  >
                    桌面
                  </Button>
                  <Button
                    size="sm"
                    variant={device === 'tablet' ? 'default' : 'outline'}
                    onClick={() => setDevice('tablet')}
                  >
                    平板
                  </Button>
                  <Button
                    size="sm"
                    variant={device === 'mobile' ? 'default' : 'outline'}
                    onClick={() => setDevice('mobile')}
                  >
                    手机
                  </Button>
                </>
              ) : null}
              <div className="flex-1" />
              {identity ? (
                <a
                  href={`/api/export?session=${encodeURIComponent(sessionIdRef.current)}`}
                  download
                  className="inline-flex items-center justify-center rounded-md text-sm font-medium border border-input bg-background hover:bg-accent h-7 px-2.5 transition-colors"
                >
                  导出 zip
                </a>
              ) : null}
              {previewUrl ? (
                <Badge variant="secondary">
                  <a href={previewUrl} target="_blank" rel="noopener noreferrer">↗ 新标签页</a>
                </Badge>
              ) : (
                <Badge variant="secondary">尚未生成</Badge>
              )}
            </div>

            <div className="flex-1 overflow-hidden flex items-center justify-center p-4">
              {pane === 'code' ? (
                <CodeViewer files={codeFiles} current={codeFile} onOpen={(p) => void openFile(p)} />
              ) : previewUrl ? (
                <DeviceFrame device={device} url={previewUrl} nonce={previewNonce} />
              ) : (
                <span className="text-sm text-muted-foreground">预览会在应用能跑起来之后出现</span>
              )}
            </div>
          </section>
        ) : null}
      </div>
    </div>
  );
}

/* ---- Sub-components ----------------------------------------------------- */

function EmptyState({
  onExampleClick,
}: {
  onExampleClick: (text: string) => void;
}) {
  return (
    <div className="mx-auto max-w-3xl px-4 space-y-6 pt-8 pb-12 text-center">
      <h1 className="text-3xl font-semibold tracking-tight">想做点什么？</h1>
      <p>
        <a
          href="/login"
          className="text-sm text-muted-foreground hover:text-foreground underline underline-offset-2"
        >
          换设备了？登录已有账户
        </a>
      </p>
      <p className="text-sm text-muted-foreground">
        描述你想要的网站或工具，Alex 会把它建出来。
        <br />
        不需要写代码，也不需要注册。
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-4">
        {[
          ['📔', '记录每日心情的应用', '日期、心情等级、备注，数据存在浏览器里'],
          ['✅', '一个待办清单', '可增删、可标记完成、可筛选'],
          ['⏱️', '番茄钟计时器', '25 分钟倒计时、专注历史记录'],
        ].map(([icon, title, sub]) => (
          <button
            type="button"
            key={title}
            onClick={() => onExampleClick(`做一个${title}：${sub}`)}
            className="text-left p-4 rounded-lg border bg-card hover:bg-accent transition-colors"
          >
            <div className="text-2xl mb-2">{icon}</div>
            <div className="font-medium">
              {title}
              <div className="text-xs text-muted-foreground mt-1">{sub}</div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

function UserBubble({ text }: { text: string }) {
  return (
    <div className="flex justify-end">
      <div className="max-w-[80%] rounded-2xl rounded-br-sm bg-primary text-primary-foreground px-4 py-2 text-sm">
        {text}
      </div>
    </div>
  );
}

function AgentBubble({ message }: { message: AgentMessage }) {
  const av = AGENT_NAMES[message.agentHandle].charAt(0);
  const colorByAgent: Record<AgentHandle, string> = {
    lead: 'bg-zinc-500',
    pm: 'bg-purple-500',
    eng: 'bg-blue-500',
  };
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span className={`size-6 rounded-full ${colorByAgent[message.agentHandle]} text-white grid place-items-center text-[10px] font-bold`}>
          {av}
        </span>
        <span>{AGENT_NAMES[message.agentHandle]} · {AGENT_ROLE_LABELS[message.agentHandle]}</span>
      </div>

      {message.text ? (
        <div className="rounded-2xl rounded-bl-sm bg-muted px-4 py-2 text-sm max-w-[80%]">
          {message.text}
        </div>
      ) : null}

      <div className="space-y-1">
        {message.files.map((file) => (
          <FileRow key={file.toolCallId} file={file} />
        ))}
        {message.steps.map((step, i) =>
          step.step === 'autofixing' ? (
            <Alert key={`${message.messageId}-s${i}`}>
              <AlertTitle className="text-xs">⚠ 出了点问题，Alex 正在自己修（第 {step.attempt} 次）</AlertTitle>
              {step.error ? (
                <details className="text-xs mt-1">
                  <summary className="cursor-pointer text-muted-foreground">查看详情</summary>
                  <pre className="mt-1 p-2 bg-muted rounded overflow-x-auto">{step.error}</pre>
                </details>
              ) : null}
            </Alert>
          ) : (
            <StepRow key={`${message.messageId}-s${i}`} step={step} />
          ),
        )}
      </div>

      {message.finished && message.agentHandle === 'eng' && message.files.length > 0 ? (
        <div className="text-xs text-muted-foreground">
          本轮改了 {message.files.length} 个文件：
          {message.files.map((f) => f.path).filter(Boolean).join('、')}
        </div>
      ) : null}

      {message.errors.map((error, i) => (
        <Alert key={`${message.messageId}-e${i}`} variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ))}
    </div>
  );
}

function FileRow({ file }: { file: FileEntry }) {
  const color =
    file.state === 'done' ? 'text-emerald-600' :
    file.state === 'writing' ? 'text-blue-600' :
    'text-zinc-400';
  const icon = file.state === 'done' ? '✓' : file.state === 'writing' ? '▶' : '·';
  return (
    <div className="flex items-center gap-2 text-xs font-mono px-2">
      <span className={color}>{icon}</span>
      <span className="flex-1 truncate">{file.path ?? '准备写入…'}</span>
      {file.bytes !== null ? <span className="text-muted-foreground">{file.bytes}B</span> : null}
      {file.state === 'planned' ? <span className="text-muted-foreground">待生成</span> : null}
    </div>
  );
}

function StepRow({ step }: { step: StepEntry }) {
  const label =
    step.step === 'installing' ? '安装依赖 npm install' :
    step.step === 'migrating' ? '数据库迁移与安全检查' :
    step.step === 'building' ? '构建 npm run build' :
    step.step === 'starting' ? '启动开发服务器' :
    step.step === 'preview_ready' ? '预览就绪' :
    step.step;
  const done = step.step === 'preview_ready';
  const color = done ? 'text-emerald-600' : 'text-blue-600';
  const icon = done ? '✓' : '▶';
  return (
    <div className="flex items-center gap-2 text-xs font-mono px-2">
      <span className={color}>{icon}</span>
      <span className="flex-1">{label}</span>
    </div>
  );
}

function PlanTree({ files }: { files: FileEntry[] }) {
  return (
    <Card>
      <CardContent className="pt-4 space-y-1">
        <div className="text-xs font-medium text-muted-foreground mb-2">
          {progressText(files)}
        </div>
        {files.map((file) => (
          <FileRow key={file.toolCallId} file={file} />
        ))}
      </CardContent>
    </Card>
  );
}

function DeviceFrame({ device, url, nonce }: { device: string; url: string; nonce: number }) {
  const dim =
    device === 'mobile' ? 'w-[375px] h-[667px]' :
    device === 'tablet' ? 'w-[768px] h-[1024px]' :
    'w-full h-full';
  return (
    <div className={`${dim} bg-background border rounded-lg overflow-hidden shadow-sm`}>
      <iframe
        key={`${url}-${nonce}`}
        src={url}
        title="应用预览"
        className="w-full h-full"
      />
    </div>
  );
}

function CodeViewer({
  files, current, onOpen,
}: {
  files: string[];
  current: { path: string; content: string } | null;
  onOpen: (p: string) => void;
}) {
  return (
    <div className="w-full h-full grid grid-cols-[200px_1fr] bg-background border rounded-lg overflow-hidden">
      <div className="border-r overflow-y-auto p-2 space-y-0.5">
        {files.length === 0 ? (
          <div className="text-xs text-muted-foreground p-2">还没有生成文件</div>
        ) : (
          files.map((f) => (
            <button
              type="button"
              key={f}
              className={`block w-full text-left text-xs font-mono px-2 py-1 rounded hover:bg-accent ${current?.path === f ? 'bg-accent' : ''}`}
              onClick={() => onOpen(f)}
            >
              {f}
            </button>
          ))
        )}
      </div>
      <div className="overflow-auto p-3 bg-zinc-50 dark:bg-zinc-950">
        {current ? (
          <>
            <div className="text-xs text-muted-foreground mb-2">{current.path} · 只读</div>
            <pre className="text-xs font-mono">
              <code dangerouslySetInnerHTML={{ __html: highlight(current.content, current.path) }} />
            </pre>
          </>
        ) : (
          <div className="text-xs text-muted-foreground">选择左侧文件查看内容</div>
        )}
      </div>
    </div>
  );
}