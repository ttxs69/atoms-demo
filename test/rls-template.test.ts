import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  detectRlsGaps,
  extractCreatedTables,
} from '../src/backend/rls-template.ts';

test('injector appends the template per created table, after the model SQL', () => {
  const model = `CREATE TABLE notes (id int, body text);`;
  const { sql, tables } = injectRlsTemplate(model, 'ws-1');
  assert.deepEqual(tables, ['notes']);
  assert.ok(sql.indexOf(model) < sql.indexOf('platform template'));
  assert.ok(sql.includes(`ADD COLUMN IF NOT EXISTS workspace_id text NOT NULL DEFAULT 'ws-1'`));
  assert.ok(sql.includes('ENABLE ROW LEVEL SECURITY'));
  assert.ok(sql.includes('REVOKE ALL ON "notes" FROM anon, authenticated'));
  assert.ok(sql.includes('CREATE POLICY "workspace_isolation_notes"'));
});

test('the template runs LAST: model grants are revoked after being granted', () => {
  // The official lesson: "adding policies doesn't remove grants".
  const model = `CREATE TABLE t (id int);\nGRANT SELECT ON t TO anon;`;
  const { sql } = injectRlsTemplate(model, 'ws');
  assert.ok(sql.indexOf('GRANT SELECT') < sql.indexOf('REVOKE ALL'));
});

test('all CREATE TABLE shapes are handled; unparseable SQL throws', () => {
  assert.deepEqual(
    extractCreatedTables('CREATE TABLE IF NOT EXISTS public."weird name" (id int);'),
    ['weird name'],
  );
  assert.deepEqual(extractCreatedTables('create table a (x int); CREATE TABLE b (y int);'), [
    'a',
    'b',
  ]);
  assert.throws(() => extractCreatedTables('ALTER TABLE nothing SET anything;'), /no CREATE TABLE/);
});

test('detector names every table without RLS; passes when all are covered', () => {
  const failures = detectRlsGaps([
    { name: 'notes', rlsEnabled: true },
    { name: 'secrets', rlsEnabled: false },
  ]);
  assert.equal(failures.length, 1);
  assert.equal(failures[0]!.code, 'RLS_DISABLED');
  assert.ok(failures[0]!.detail.includes('secrets'));
  assert.deepEqual(detectRlsGaps([{ name: 'ok', rlsEnabled: true }]), []);
});

// ─── ticket 03: the shared-project gate (real Postgres semantics) ─────────

import { PGlite } from '@electric-sql/pglite';
import { SharedProjectGate } from '../src/backend/supabase-gate.ts';
import { injectRlsTemplate } from '../src/backend/rls-template.ts';
import type { SqlClient } from '../src/credits/ledger.ts';

async function makeGateDb(): Promise<SqlClient> {
  const db = new PGlite();
  // Real Supabase has these roles; pglite doesn't — create them so the
  // template's REVOKE executes against the same shape as production.
  await db.query('CREATE ROLE anon');
  await db.query('CREATE ROLE authenticated');
  const client = db as unknown as SqlClient;
  (client as { transaction?: unknown }).transaction = async <T>(fn: (c: SqlClient) => Promise<T>) => {
    await db.query('BEGIN');
    try {
      const out = await fn(client);
      await db.query('COMMIT');
      return out;
    } catch (e) {
      await db.query('ROLLBACK');
      throw e;
    }
  };
  return client;
}

test('gate passes an injected migration and the table survives; RLS verified', async () => {
  const db = await makeGateDb();
  const gate = new SharedProjectGate(db);
  const sql = injectRlsTemplate('CREATE TABLE notes (id int, body text);', 'ws-1').sql;
  const verdict = await gate.check({ sandboxId: 'sbx', workspaceId: 'ws-1', migrationSql: sql });
  assert.equal(verdict.ok, true);
  const check = await db.query<{ rowsecurity: boolean }>(
    `SELECT rowsecurity FROM pg_tables WHERE tablename = 'notes'`,
  );
  assert.equal(check.rows[0]!.rowsecurity, true);
});

test('gate FAILS unsafe SQL and rolls it back — the table never existed', async () => {
  const db = await makeGateDb();
  const gate = new SharedProjectGate(db);
  // 模型 SQL 未经注入（防御纵深：即使注入被绕过，检测器兜底）
  const verdict = await gate.check({
    sandboxId: 'sbx',
    workspaceId: 'ws-1',
    migrationSql: 'CREATE TABLE naked (id int);',
  });
  assert.equal(verdict.ok, false);
  assert.equal((verdict as { code: string }).code, 'RLS_DISABLED');
  const after = await db.query(`SELECT 1 FROM pg_tables WHERE tablename = 'naked'`);
  assert.equal(after.rows.length, 0, 'rolled back — 未对外暴露任何数据 is literal');
});

test('gate without a database (dev degraded mode) passes explicitly', async () => {
  const gate = new SharedProjectGate(null);
  const verdict = await gate.check({ sandboxId: 's', workspaceId: 'w', migrationSql: 'x' });
  assert.equal(verdict.ok, true);
});
