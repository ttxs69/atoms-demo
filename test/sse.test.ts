import { test } from 'node:test';
import assert from 'node:assert/strict';

import { encodeEvent, decodeEvents } from '../src/transport/sse.ts';
import type { StreamEvent } from '../src/domain/events.ts';

/**
 * The codec is a pure function pair, so it gets its own round-trip test. This
 * is not an HTTP seam — it locks the wire format without standing up a server.
 */

test('an event survives a round trip through the wire format', () => {
  const event: StreamEvent = {
    type: 'tool_call_start',
    agentHandle: 'eng',
    toolCallId: 't1',
    toolName: 'write_file',
  };

  const decoded = decodeEvents(encodeEvent(event));

  assert.deepEqual(decoded.events, [event]);
});

test('several events in one chunk all decode, in order', () => {
  const events: StreamEvent[] = [
    { type: 'agent_started', agentHandle: 'eng', messageId: 'm1' },
    { type: 'text_delta', agentHandle: 'eng', delta: 'writing' },
    { type: 'agent_done', agentHandle: 'eng', creditsUsed: 12 },
  ];

  const wire = events.map(encodeEvent).join('');

  assert.deepEqual(decodeEvents(wire).events, events);
});

test('content containing newlines survives the round trip', () => {
  // Generated file content is multi-line, and SSE treats a bare newline as a
  // field separator. If this breaks, every generated file arrives truncated.
  const event: StreamEvent = {
    type: 'tool_input_delta',
    agentHandle: 'eng',
    toolCallId: 't1',
    argsDelta: '{"content":"line one\nline two\n\nline four"}',
  };

  assert.deepEqual(decodeEvents(encodeEvent(event)).events, [event]);
});

test('a half-received event is held back until the rest arrives', () => {
  const wire = encodeEvent({ type: 'text_delta', agentHandle: 'eng', delta: 'hello' });
  const split = Math.floor(wire.length / 2);

  const first = decodeEvents(wire.slice(0, split));
  assert.deepEqual(first.events, []);

  const second = decodeEvents(first.rest + wire.slice(split));
  assert.deepEqual(second.events, [
    { type: 'text_delta', agentHandle: 'eng', delta: 'hello' },
  ]);
});

test('transient progress events travel over the same wire', () => {
  // plan_ready / gate_started / sandbox_state are not persisted, but they do
  // have to reach the browser.
  const event: StreamEvent = { type: 'plan_ready', files: ['index.html', 'src/App.tsx'] };

  assert.deepEqual(decodeEvents(encodeEvent(event)).events, [event]);
});
