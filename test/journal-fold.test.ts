import { test } from 'node:test';
import assert from 'node:assert/strict';

import { foldTurn } from '../src/journal/fold.ts';
import type { JournalRecord, AgentMessageRecord } from '../src/journal/fold.ts';
import type { StreamEvent } from '../src/domain/events.ts';

/**
 * The fold is pure — assert-based tests over the event-sequence equivalence
 * classes the orchestrator actually emits. Consistency rule under test: the
 * folded records must rebuild the same message list the live applyEvent
 * builds (docs/04 §3.2).
 */

function agents(records: JournalRecord[]): AgentMessageRecord[] {
  return records.filter(
    (r): r is AgentMessageRecord => r.kind === 'agent_message',
  );
}

test('a full turn folds into one row per message', () => {
  const records = foldTurn('做个待办应用', [
    { type: 'agent_started', agentHandle: 'pm', messageId: 'msg-1' },
    { type: 'text_delta', agentHandle: 'pm', delta: '计划：' },
    { type: 'text_delta', agentHandle: 'pm', delta: '三个页面' },
    { type: 'tool_call_start', agentHandle: 'pm', toolCallId: 't1', toolName: 'plan_files' },
    { type: 'tool_input_delta', agentHandle: 'pm', toolCallId: 't1', argsDelta: '{"files":' },
    { type: 'tool_result', agentHandle: 'pm', toolCallId: 't1', result: { ok: true, files: 3 } },
    { type: 'agent_done', agentHandle: 'pm', creditsUsed: 120 },
    { type: 'agent_started', agentHandle: 'eng', messageId: 'msg-2' },
    { type: 'text_delta', agentHandle: 'eng', delta: '开始写 ' },
    { type: 'run_step', step: 'installing' },
    { type: 'tool_call_start', agentHandle: 'eng', toolCallId: 't2', toolName: 'write_file' },
    { type: 'tool_result', agentHandle: 'eng', toolCallId: 't2', result: { ok: true, path: 'src/App.tsx', bytes: 900 } },
    { type: 'error', agentHandle: 'eng', message: 'build failed: x' },
    { type: 'agent_done', agentHandle: 'eng', creditsUsed: 4000 },
  ]);

  assert.equal(records.length, 3);
  assert.deepEqual(records[0], { kind: 'user_message', messageId: null, text: '做个待办应用' });

  const pm = agents(records)[0]!;
  const eng = agents(records)[1]!;
  assert.equal(pm.text, '计划：三个页面');
  // plan_files returns no path — live keeps a null-path entry, so does the fold
  assert.deepEqual(pm.files, [{ path: null, bytes: null }]);
  assert.equal(pm.creditsUsed, 120);
  assert.equal(pm.aborted, false);

  assert.equal(eng.text, '开始写 ');
  assert.deepEqual(eng.files, [{ path: 'src/App.tsx', bytes: 900 }]);
  assert.deepEqual(eng.errors, ['build failed: x']);
  assert.equal(eng.creditsUsed, 4000);
  assert.equal(eng.aborted, false);
});

test('the autofix nesting keeps the outer buffer: started(m1)…started(m2)…done…done', () => {
  // The self-repair loop's real sequence (orchestrator lines ~407/~753):
  // the fix turn's agent_started arrives while the build buffer is open.
  const records = foldTurn('做个应用', [
    { type: 'agent_started', agentHandle: 'eng', messageId: 'msg-1' },
    { type: 'text_delta', agentHandle: 'eng', delta: '我先把页面写好' },
    { type: 'agent_started', agentHandle: 'eng', messageId: 'msg-2' },
    { type: 'text_delta', agentHandle: 'eng', delta: '构建挂了，我来修' },
    { type: 'agent_done', agentHandle: 'eng', creditsUsed: 0 },
    { type: 'agent_done', agentHandle: 'eng', creditsUsed: 5000 },
  ]);

  const outer = agents(records)[0]!;
  const inner = agents(records)[1]!;
  assert.equal(outer.messageId, 'msg-1');
  assert.equal(outer.text, '我先把页面写好');
  assert.equal(outer.creditsUsed, null); // no own done event — but not aborted
  assert.equal(outer.aborted, false);
  assert.equal(inner.messageId, 'msg-2');
  assert.equal(inner.text, '构建挂了，我来修');
  assert.equal(inner.creditsUsed, 0);
});

test('an interrupted turn keeps the partial text, flagged aborted', () => {
  const records = foldTurn('再来', [
    { type: 'agent_started', agentHandle: 'eng', messageId: 'msg-9' },
    { type: 'text_delta', agentHandle: 'eng', delta: '写到一半' },
    { type: 'interrupted', reason: 'user' },
  ]);

  assert.equal(records[0]!.kind, 'user_message');
  const eng = agents(records)[0]!;
  assert.equal(eng.text, '写到一半');
  assert.equal(eng.creditsUsed, null);
  assert.equal(eng.aborted, true);
});

test('a route-level failure with no agent_started folds into an empty error bubble', () => {
  // The generate route's catch pushes an orphan error event when the
  // orchestrator throws before yielding anything.
  const records = foldTurn('试试', [
    { type: 'error', agentHandle: 'eng', message: 'sandbox create failed' },
  ]);

  assert.equal(records[0]!.kind, 'user_message');
  const eng = agents(records)[0]!;
  assert.equal(eng.text, '');
  assert.deepEqual(eng.errors, ['sandbox create failed']);
  assert.equal(eng.aborted, true);
});

test('an empty turn is still the user message', () => {
  assert.deepEqual(foldTurn('hi', []), [
    { kind: 'user_message', messageId: null, text: 'hi' },
  ]);
});
