import { test } from 'node:test';
import assert from 'node:assert/strict';

import { syncProjectFiles } from '../src/ports/supabase-snapshot.ts';

/**
 * The manifest mirror: snapshot object → project_files rows. What this
 * locks: delete-then-insert idempotency (a retried turn rewrites, never
 * duplicates), byte-accurate sizes, and degradation on missing/corrupt
 * snapshots (return 0 — the detail page shows the old manifest, never lies
 * with a half-sync).
 */

interface FileRow {
  project_id: string;
  path: string;
  bytes: number;
  storage_key: string;
}

function fakeDb(snapshot: Record<string, string> | null) {
  const rows: FileRow[] = [];
  return {
    rows,
    client: {
      storage: {
        from(bucket: string) {
          assert.equal(bucket, 'project-snapshots');
          return {
            download: async () =>
              snapshot === null
                ? { data: null, error: { message: 'not found' } }
                : { data: { text: async () => JSON.stringify(snapshot) }, error: null },
          };
        },
      },
      from(table: string) {
        assert.equal(table, 'project_files');
        const eqs: Record<string, unknown> = {};
        let op: 'delete' | null = null;
        const chain = {
          eq(col: string, val: unknown) {
            eqs[col] = val;
            return chain;
          },
          delete() {
            op = 'delete';
            return chain;
          },
          insert(newRows: FileRow[]) {
            rows.push(...newRows);
            return { error: null };
          },
          then(onFulfilled?: unknown, onRejected?: unknown) {
            const run = async () => {
              if (op === 'delete') {
                const matches = rows.filter((r) =>
                  Object.entries(eqs).every(([c, v]) => (r as unknown as Record<string, unknown>)[c] === v),
                );
                for (const row of matches) rows.splice(rows.indexOf(row), 1);
              }
            };
            return run().then(onFulfilled as never, onRejected as never);
          },
        };
        return chain;
      },
    } as unknown as Parameters<typeof syncProjectFiles>[0],
  };
}

test('syncProjectFiles mirrors the snapshot into rows, byte-accurate', async () => {
  const db = fakeDb({ 'src/App.tsx': 'const x = "中文";', 'package.json': '{}' });
  const count = await syncProjectFiles(db.client, 'p1', 'w1');

  assert.equal(count, 2);
  assert.deepEqual(
    db.rows.map((r) => [r.path, r.bytes]),
    [
      ['src/App.tsx', Buffer.byteLength('const x = "中文";', 'utf8')], // CJK ≠ char count
      ['package.json', 2],
    ],
  );
  assert.equal(db.rows[0]!.project_id, 'p1');
  assert.equal(db.rows[0]!.storage_key, 'w1.json');
});

test('re-sync rewrites, never duplicates (turn idempotency)', async () => {
  const db = fakeDb({ 'a.txt': 'x' });
  await syncProjectFiles(db.client, 'p1', 'w1');
  await syncProjectFiles(db.client, 'p1', 'w1');

  assert.equal(db.rows.length, 1);
  // A changed tree replaces wholesale — stale paths do not survive.
  const db2 = fakeDb({ 'b.txt': 'y' });
  const first = fakeDb({ 'a.txt': 'x' });
  await syncProjectFiles(first.client, 'p1', 'w1');
  await syncProjectFiles(db2.client, 'p1', 'w1');
  assert.deepEqual(db2.rows.map((r) => r.path), ['b.txt']);
});

test('missing or corrupt snapshot degrades to 0, rows untouched', async () => {
  const missing = fakeDb(null);
  assert.equal(await syncProjectFiles(missing.client, 'p1', 'w1'), 0);
  assert.equal(missing.rows.length, 0);

  const corrupt = fakeDb({ 'a.txt': 'x' });
  (corrupt.client.storage as unknown as { from: (b: string) => { download: () => unknown } }).from = () => ({
    download: async () => ({ data: { text: async () => '{not json' }, error: null }),
  });
  assert.equal(await syncProjectFiles(corrupt.client, 'p1', 'w1'), 0);
  assert.equal(corrupt.rows.length, 0);
});
