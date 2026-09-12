'use client';

import { useCallback, useRef, useState } from 'react';
import { AGENT_NAMES, AGENT_ROLE_LABELS, type AgentHandle } from '../domain/roles.ts';
import type { StreamEvent } from '../domain/events.ts';
import { decodeEvents } from '../transport/sse.ts';

/** One file Alex touched during a turn. */
interface FileEntry {
  toolCallId: string;
  path: string | null;
  bytes: number | null;
  state: 'writing' | 'done';
}

/** One pipeline step the orchestrator ran (install / build / start). */
interface StepEntry {
  step: string;
  url?: string;
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

export function Workspace() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [log, setLog] = useState<string[]>([]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [fatal, setFatal] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [device, setDevice] = useState<'desktop' | 'tablet' | 'mobile'>('desktop');

  // One session for the lifetime of the tab. Persisting it is ticket 07's job.
  const sessionIdRef = useRef<string>(`s-${Date.now()}`);
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
    } else if (event.type === 'run_step' && event.step === 'preview_ready' && event.url) {
      setPreviewUrl(event.url);
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
          const entry: StepEntry =
            event.url !== undefined
              ? { step: event.step, url: event.url }
              : { step: event.step };
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

        default:
          // Transient progress events are logged but have no home in the
          // message list until later tickets render them.
          return prev;
      }
    });
  }, []);

  const submit = useCallback(async () => {
    const message = input.trim();
    if (message.length === 0 || streaming) return;

    setInput('');
    setFatal(null);
    setStreaming(true);
    setMessages((prev) => [
      ...prev,
      { kind: 'user', messageId: `u-${prev.length}`, text: message },
    ]);

    try {
      const response = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ sessionId: sessionIdRef.current, message }),
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
      setFatal(error instanceof Error ? error.message : String(error));
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
        {streaming ? <span className="pill run">生成中</span> : null}
        {fatal ? <span className="pill err">出错了</span> : null}
      </div>

      <div className="body">
        <section className="chat" aria-label="对话">
          <div className="chat-scroll">
            {messages.length === 0 ? (
              <div className="empty">
                <h1>想做点什么？</h1>
                <p>
                  描述你想要的网站或工具，Alex 会把它建出来。
                  <br />
                  不需要写代码，也不需要注册。
                </p>
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

                  {message.steps.map((step, index) => (
                    <div className={`file-line ${step.step === 'preview_ready' ? 'done' : 'writing'}`} key={`${message.messageId}-s${index}`}>
                      <span className="status">{step.step === 'preview_ready' ? '✓' : '▶'}</span>
                      <span>
                        {step.step === 'installing' && '安装依赖 npm install'}
                        {step.step === 'building' && '构建 npm run build'}
                        {step.step === 'starting' && '启动开发服务器'}
                        {step.step === 'preview_ready' && '预览就绪'}
                      </span>
                    </div>
                  ))}

                  {message.errors.map((error, index) => (
                    <div className="bub error" key={`${message.messageId}-e${index}`}>
                      {error}
                    </div>
                  ))}
                </div>
              ),
            )}

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
            <div className="composer-row">
              <button
                type="button"
                className="btn primary"
                onClick={() => void submit()}
                disabled={streaming || input.trim().length === 0}
              >
                {streaming ? '生成中…' : '开始'}
              </button>
              <span className="spacer" />
              <span className="pill">⌘↩ 发送</span>
            </div>
          </div>
        </section>

        <section className="preview" aria-label="预览">
          <div className="preview-bar">
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
            <div className="spacer" />
            {previewUrl ? (
              <a className="pill" href={previewUrl} target="_blank" rel="noopener noreferrer">
                ↗ 新标签页
              </a>
            ) : (
              <span className="pill">尚未生成</span>
            )}
          </div>
          <div className="preview-stage">
            {previewUrl ? (
              <div className={`device device-${device}`}>
                <iframe src={previewUrl} title="应用预览" className="preview-frame" />
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
