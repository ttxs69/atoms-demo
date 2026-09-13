import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  detectRlsGaps,
  extractCreatedTables,
  injectRlsTemplate,
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
