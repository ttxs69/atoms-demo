import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createModelAdapter } from '../src/ports/llm-model-adapter.ts';
import type { ModelChunk, StepMessage } from '../src/ports/model-port.ts';

/**
 * Prompt-health tests: real model, real money, deliberately WIDE assertions.
 *
 * These do NOT test behaviour (the scripted seam suite does that) — they are
 * the alarm for prompt drift: the day the model stops calling our tools,
 * these go red while everything else stays green.
 *
 * Run: npm run test:live  (never part of `npm test`)
 * Skipped automatically when LLM_API_KEY is absent.
 */

function loadEnv(): { baseUrl: string; apiKey: string; model: string } {
  if (process.env['LLM_API_KEY']) {
    return {
      baseUrl: process.env['LLM_BASE_URL'] ?? 'https://api.deepseek.com/v1',
      apiKey: process.env['LLM_API_KEY']!,
      model: process.env['LLM_MODEL'] ?? 'deepseek-chat',
    };
  }
  try {
    const raw = readFileSync('.env', 'utf8');
    const map = new Map(
      raw
        .split('\n')
        .filter((l) => l.includes('=') && !l.startsWith('#'))
        .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]),
    );
    return {
      baseUrl: map.get('LLM_BASE_URL') ?? 'https://api.deepseek.com/v1',
      apiKey: map.get('LLM_API_KEY') ?? '',
      model: map.get('LLM_MODEL') ?? 'deepseek-chat',
    };
  } catch {
    return { baseUrl: '', apiKey: '', model: '' };
  }
}

const env = loadEnv();
// Live tests ONLY run when explicitly asked (RUN_LIVE=1 via npm run
// test:live). `npm test` must stay offline, free, and deterministic —
// even when a .env with a real key sits in the repo root.
const hasKey = process.env['RUN_LIVE'] === '1' && env.apiKey.length > 0;

function model() {
  return createModelAdapter({
    protocol: 'openai',
    baseUrl: env.baseUrl,
    apiKey: env.apiKey,
    model: env.model,
  });
}

async function drain(stream: AsyncIterable<ModelChunk>): Promise<ModelChunk[]> {
  const out: ModelChunk[] = [];
  for await (const chunk of stream) out.push(chunk);
  return out;
}

/** Accumulate streamed tool args into parsed JSON per tool call. */
function collectCalls(chunks: ModelChunk[]): Map<string, { name: string; args: unknown }> {
  const calls = new Map<string, { name: string; args: unknown }>();
  for (const c of chunks) {
    if (c.type === 'tool_call_start') calls.set(c.toolCallId, { name: c.toolName, args: '' });
    if (c.type === 'tool_input_delta') {
      const call = calls.get(c.toolCallId);
      if (call && typeof call.args === 'string') call.args += c.argsDelta;
    }
  }
  for (const [id, call] of calls) {
    if (typeof call.args === 'string' && call.args.length > 0) {
      try {
        call.args = JSON.parse(call.args);
      } catch {
        /* leave as string; the assertion will catch it */
      }
    }
    calls.set(id, call);
  }
  return calls;
}

test('live: lead responds with text and never writes code himself', { skip: !hasKey }, async () => {
  const chunks = await drain(
    model().stream('lead', [
      { role: 'user', content: '我想做一个记录每天喝水量的小应用' },
    ]),
  );
  const text = chunks
    .filter((c): c is Extract<ModelChunk, { type: 'text' }> => c.type === 'text')
    .map((c) => c.delta)
    .join('');
  const toolCalls = chunks.filter((c) => c.type === 'tool_call_start');

  assert.ok(text.length > 10, 'lead says something substantial');
  assert.equal(toolCalls.length, 0, 'lead has no tools — he delegates, he does not write');
});

test('live: Emma plans with plan_files and the list looks like files', { skip: !hasKey }, async () => {
  const chunks = await drain(
    model().stream('pm', [{ role: 'user', content: '做一个待办清单应用，能标记完成和筛选' }]),
  );
  const calls = collectCalls(chunks);
  const plan = [...calls.values()].find((c) => c.name === 'plan_files');

  assert.ok(plan, 'Emma calls plan_files');
  const args = plan!.args as { files?: unknown; description?: unknown };
  assert.ok(Array.isArray(args.files) && args.files.length > 0, 'non-empty file list');
  for (const f of args.files as string[]) {
    assert.ok(
      typeof f === 'string' && /^[\w./-]+\.(tsx?|css|json|html)$/.test(f),
      `looks like a path: ${String(f)}`,
    );
  }
  assert.ok(typeof args.description === 'string' && args.description.length > 0);
});

test('live: Alex writes real files via write_file', { skip: !hasKey }, async () => {
  const chunks = await drain(
    model().stream('eng', [
      { role: 'user', content: 'User request: 最小 hello 应用\n\nFiles to write (write EVERY one):\n- src/App.tsx' },
    ]),
  );
  const calls = collectCalls(chunks);
  const writes = [...calls.values()].filter((c) => c.name === 'write_file');

  assert.ok(writes.length > 0, 'at least one write_file');
  for (const w of writes) {
    const args = w.args as { path?: unknown; content?: unknown };
    assert.ok(typeof args.path === 'string' && args.path.length > 0);
    assert.ok(typeof args.content === 'string' && (args.content as string).length > 0);
  }
});

test('live: given a build error, Alex produces a DIFFERENT write', { skip: !hasKey }, async () => {
  const conversation: ({ role: 'user'; content: string } | StepMessage)[] = [
    { role: 'user', content: 'User request: hello 应用\n\nFiles to write:\n- src/App.tsx' },
    {
      role: 'assistant',
      content: [
        {
          type: 'tool-call',
          toolCallId: 'c1',
          toolName: 'write_file',
          input: { path: 'src/App.tsx', content: 'export default function App() { return <p>hi</p> }' },
        },
      ],
    },
    {
      role: 'tool',
      content: [
        {
          type: 'tool-result',
          toolCallId: 'c1',
          toolName: 'write_file',
          output: { type: 'text', value: '{"ok":true,"path":"src/App.tsx","bytes":46}' },
        },
      ],
    },
    {
      role: 'user',
      content:
        'npm run build failed with this output:\n\nsrc/App.tsx(1,37): error TS2304: Cannot find name "p" — the JSX tag is not imported.\n\nFix the code so the build passes. Write ONLY the files that need changes.',
    },
  ];
  const chunks = await drain(model().stream('eng', conversation));
  const calls = collectCalls(chunks);
  const writes = [...calls.values()].filter((c) => c.name === 'write_file');

  assert.ok(writes.length > 0, 'a fix write happened');
  const first = writes[0]!.args as { content?: string };
  assert.notEqual(
    first.content,
    'export default function App() { return <p>hi</p> }',
    'the fix is not a repetition of the broken content',
  );
});
