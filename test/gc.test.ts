import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';

import {
  deriveExpired,
  enqueue,
  migrateGc,
  sweep,
  type ActivityRow,
  type Deleters,
} from '../src/gc/engine.ts';
import { PostgresCredits, type SqlClient } from '../src/credits/ledger.ts';

async function makeDb(): Promise<SqlClient> {
  const db = new PGlite();
  const client = db as unknown as SqlClient;
  await PostgresCredits.migrate(client);
  await migrateGc(client);
  return client;
}

function daysAgo(n: number): Date {
  return new Date(Date.now() - n * 86_400_000 - 1);
}

test('expiry derivation: 30d user / 14d sandbox boundaries', () => {
  const now = new Date();
  const activity: ActivityRow[] = [
    { user_id: 'fresh', last_activity: daysAgo(3) },
    { user_id: 'sandbox-idle', last_activity: daysAgo(20) },
    { user_id: 'user-expired', last_activity: daysAgo(31) },
  ];
  const { expiredUsers, idleSandboxes } = deriveExpired(activity, now);
  assert.deepEqual(expiredUsers, ['user-expired']);
  assert.deepEqual(idleSandboxes, ['sandbox-idle']);
});

test('sweep executes in dependency order and marks done', async () => {
  const db = await makeDb();
  await db.query(
    `INSERT INTO credit_ledger (user_id, day, kind, amount, idempotency_key, created_at)
     VALUES ('u1', CURRENT_DATE - 40, 'reserve', -1, 'old', now() - interval '31 days')`,
  );
  const calls: string[] = [];
  const deleters: Deleters = {
    killSandbox: async (w) => void calls.push(`sandbox:${w}`),
    deleteSharedRows: async (w) => void calls.push(`shared:${w}`),
    deleteForgeRows: async (w) => void calls.push(`forge:${w}`),
    deleteAuthUser: async (w) => void calls.push(`auth:${w}`),
  };

  const report = await sweep(db, deleters);

  assert.deepEqual(calls, ['sandbox:u1', 'shared:u1', 'forge:u1', 'auth:u1']);
  assert.equal(report.executed, 4);
  const done = await db.query(`SELECT COUNT(*) AS n FROM deletion_queue WHERE state = 'done'`);
  assert.equal(Number(done.rows[0]!.n), 4);
});

test('enqueue is idempotent; done rows never re-execute', async () => {
  const db = await makeDb();
  await enqueue(db, 'u2', ['sandbox']);
  await enqueue(db, 'u2', ['sandbox']);
  const rows = await db.query(`SELECT COUNT(*) AS n FROM deletion_queue`);
  assert.equal(Number(rows.rows[0]!.n), 1);

  // First sweep executes the enqueued row.
  await db.query(
    `INSERT INTO credit_ledger (user_id, day, kind, amount, idempotency_key)
     VALUES ('u2', CURRENT_DATE, 'reserve', -1, 'now')`,
  );
  let called = 0;
  const deleters: Deleters = {
    killSandbox: async () => void called++,
    deleteSharedRows: async () => void called++,
    deleteForgeRows: async () => void called++,
    deleteAuthUser: async () => void called++,
  };
  const first = await sweep(db, deleters);
  assert.equal(first.executed, 1, 'the pending row runs once');
  // Second sweep: the row is done and u2 is active — nothing happens.
  const second = await sweep(db, deleters);
  assert.equal(second.executed + second.failed, 0);
  assert.equal(called, 1, 'exactly one call total');
});

test('failures back off, retry when due, and flip to failed after 5 strikes', async () => {
  const db = await makeDb();
  await enqueue(db, 'u3', ['sandbox'], new Date('2026-01-01T00:00:00Z'));
  let failures = 0;
  const flaky: Deleters = {
    killSandbox: async () => {
      failures += 1;
      if (failures <= 5) throw new Error('sandbox api down');
    },
    deleteSharedRows: async () => {},
    deleteForgeRows: async () => {},
    deleteAuthUser: async () => {},
  };

  // Strikes 1..5 — each sweep executes the due row once.
  let t = new Date('2026-01-01T00:00:00Z');
  for (let i = 0; i < 5; i++) {
    const r = await sweep(db, flaky, t);
    assert.equal(r.failed, 1, `strike ${i + 1}`);
    t = new Date(t.getTime() + 2 ** (i + 1) * 60_000 + 1000); // past the backoff
  }
  const row = await db.query<{ state: string; attempts: number; last_error: string }>(
    `SELECT state, attempts, last_error FROM deletion_queue WHERE workspace_id = 'u3'`,
  );
  assert.equal(row.rows[0]!.state, 'failed');
  assert.equal(row.rows[0]!.attempts, 5);
  assert.ok(row.rows[0]!.last_error.includes('sandbox api down'));

  // A failed row stays put (no further sweeps touch it).
  const r6 = await sweep(db, flaky, t);
  assert.equal(r6.failed + r6.executed, 0);
});

// ─── ticket 02: the delete-project entry enqueues and sweeps ──────────────

import { DELETE as deleteWorkspace } from '../src/app/api/workspace/route.ts';

test('DELETE /api/workspace enqueues all four targets for the session user', async () => {
  // 与路由共享同一个平台 client（ledgerDb 的进程级单例）
  const { ledgerDb } = await import('../src/credits/route-credits.ts');
  const db = await ledgerDb();
  await PostgresCredits.migrate(db);
  await migrateGc(db);
  await db.query(
    `INSERT INTO credit_ledger (user_id, day, kind, amount, idempotency_key)
     VALUES ('dev-ws', CURRENT_DATE, 'reserve', -1, 'k')
     ON CONFLICT (idempotency_key) DO NOTHING`,
  );
  delete process.env['E2B_API_KEY'];
  delete process.env['SUPABASE_URL'];
  delete process.env['APPS_SUPABASE_URL'];
  const res = await deleteWorkspace(
    new Request('http://x/api/workspace', {
      method: 'DELETE',
      headers: { 'x-dev-session': 'dev-ws' },
    }),
  );
  assert.equal(res.status, 200);
  const rows = await db.query<{ target: string; state: string }>(
    `SELECT target, state FROM deletion_queue WHERE workspace_id = 'dev-ws' ORDER BY id`,
  );
  assert.deepEqual(
    rows.rows.map((r) => r.target),
    ['sandbox', 'supabase_rows', 'forge_rows', 'auth_user'],
  );
  // Degraded deleters are no-ops → everything completed.
  assert.ok(rows.rows.every((r) => r.state === 'done'));
  // Platform rows really are gone (the one deleter with a live db here).
  const left = await db.query(`SELECT 1 FROM credit_ledger WHERE user_id = 'dev-ws'`);
  assert.equal(left.rows.length, 0);
});

// ─── ticket 03: dead-sandbox self-heal (GC ↔ generation loop 交汇点) ─────

import { createOrchestrator } from '../src/orchestrator/orchestrator.ts';
import { FakeSandbox } from './fakes/fake-sandbox.ts';
import { FakeModel, type ScriptedTurn } from './fakes/fake-model.ts';
import { planTurn } from './fakes/plan-turn.ts';

test('a GC-killed sandbox self-heals: next run is a fresh FIRST turn', async () => {
  const sandbox = new FakeSandbox();
  const writes: ScriptedTurn[] = [
    [
      { type: 'tool_call_start', toolCallId: 'a', toolName: 'write_file' },
      { type: 'tool_input_delta', toolCallId: 'a', argsDelta: '{"path":"src/App.tsx","content":"v1"}' },
      { type: 'tool_call_end', toolCallId: 'a' },
    ],
    [{ type: 'text', delta: 'done' }],
    [
      { type: 'tool_call_start', toolCallId: 'b', toolName: 'write_file' },
      { type: 'tool_input_delta', toolCallId: 'b', argsDelta: '{"path":"src/App.tsx","content":"v2"}' },
      { type: 'tool_call_end', toolCallId: 'b' },
    ],
    [{ type: 'text', delta: 'done' }],
  ];
  const model2 = new FakeModel({
    pm: [...planTurn(['src/App.tsx']), ...planTurn(['src/App.tsx'])],
    eng: writes,
  });
  const orchestrator = createOrchestrator({
    sandbox,
    model: model2,
    credits: { reserve: async () => ({ ok: true }), settle: async () => {} },
  });

  // turn 1: 完整首轮
  const t1 = [];
  for await (const e of orchestrator.run('ws-heal', '做个应用')) t1.push(e);
  const sandboxId1 = [...sandbox.files.keys()][0]!;
  assert.ok(t1.some((e) => e.type === 'plan_ready'));

  // GC 杀掉沙箱
  await sandbox.kill(sandboxId1);

  // turn 2: 自愈——重新 pm 规划（新一轮 plan_ready），新沙箱
  const t2 = [];
  for await (const e of orchestrator.run('ws-heal', '再来')) t2.push(e);
  assert.ok(t2.some((e) => e.type === 'plan_ready'), 'dead sandbox → first-turn semantics');
  assert.equal(sandbox.files.size, 1, 'a NEW sandbox exists');
  const sandboxId2 = [...sandbox.files.keys()][0]!;
  assert.notEqual(sandboxId2, sandboxId1);
  const content = await sandbox.readFile(sandboxId2, 'src/App.tsx');
  assert.equal(content, 'v2');
});
