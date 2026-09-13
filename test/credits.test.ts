import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';

import { PostgresCredits, type SqlClient } from '../src/credits/ledger.ts';

/** Fresh real-Postgres (WASM) instance per test — same SQL as production. */
async function makeLedger(cap = 10): Promise<{ credits: PostgresCredits; db: PGlite }> {
  const db = new PGlite();
  const client = db as unknown as SqlClient;
  // pglite has no nested transaction() helper — provide one over BEGIN/COMMIT.
  (client as { transaction?: unknown }).transaction = async <T>(
    fn: (tx: SqlClient) => Promise<T>,
  ): Promise<T> => {
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
  await PostgresCredits.migrate(client);
  return { credits: new PostgresCredits(client, { dailyCap: cap, tokensPerPoint: 1000 }), db };
}

test('reserve within cap succeeds; over cap rejects with resetsAt', async () => {
  const { credits } = await makeLedger(10); // 10 points = 10k tokens
  const a = await credits.reserve('u1', 5000); // 5 points
  assert.equal(a.ok, true);
  const b = await credits.reserve('u1', 5000); // 5 more → at cap
  assert.equal(b.ok, true);
  const c = await credits.reserve('u1', 1000); // 1 over → reject
  assert.equal(c.ok, false);
  assert.ok(c.resetsAt && c.resetsAt.endsWith('T00:00:00.000Z'), 'resets at midnight UTC');
});

test('the same idempotency key reserves once, replaying the first verdict', async () => {
  const { credits } = await makeLedger(10);
  const key = 'req-1';
  const first = await credits.reserve('u1', 3000, { idempotencyKey: key });
  const retry = await credits.reserve('u1', 3000, { idempotencyKey: key });
  assert.equal(first.ok && retry.ok, true);
  const snap = await credits.snapshot('u1');
  assert.equal(snap!.reserved, 3, 'one deduction, not two');
});

test('settle releases the reservation and books actual spend — refund is implicit', async () => {
  const { credits } = await makeLedger(10);
  await credits.reserve('u1', 8000, { idempotencyKey: 'r1' }); // 8 held
  await credits.settle('u1', 2000, { idempotencyKey: 'r1' }); // 2 actual
  const snap = await credits.snapshot('u1');
  assert.deepEqual(snap, { reserved: 0, spent: 2 });
  // The 6-point difference is immediately spendable again.
  const again = await credits.reserve('u1', 6000, { idempotencyKey: 'r2' });
  assert.equal(again.ok, true);
});

test('an interrupted run settles zero: full refund, quota reusable', async () => {
  const { credits } = await makeLedger(10);
  await credits.reserve('u1', 10000, { idempotencyKey: 'r1' }); // whole cap held
  await credits.settle('u1', 0, { idempotencyKey: 'r1' });
  const next = await credits.reserve('u1', 10000, { idempotencyKey: 'r2' });
  assert.equal(next.ok, true, 'nothing spent — the whole cap is back');
});

test('a new day is a new row: old balance does not carry over', async () => {
  const { credits, db } = await makeLedger(10);
  await credits.reserve('u1', 10000, { idempotencyKey: 'd1' });
  await credits.settle('u1', 10000, { idempotencyKey: 'd1' });
  // 手工把账本挪到昨天，模拟隔天
  const client = db as unknown as SqlClient;
  await client.query(`UPDATE quota SET day = day - 1 WHERE user_id = 'u1'`);
  await client.query(`UPDATE credit_ledger SET day = day - 1 WHERE user_id = 'u1'`);
  const fresh = await credits.reserve('u1', 10000, { idempotencyKey: 'd2' });
  assert.equal(fresh.ok, true, 'new day, fresh cap — no accumulation');
  const snap = await credits.snapshot('u1');
  assert.equal(snap!.reserved, 10, "today's row, not yesterday's");
});

test('interleaved reserves respect the cap (sequential-transaction simulation)', async () => {
  const { credits } = await makeLedger(10);
  // 事务一预留未结算时，事务二的校验必须看到 reserved 占用
  const r1 = await credits.reserve('u1', 6000, { idempotencyKey: 'a' }); // 6 held
  const r2 = await credits.reserve('u1', 6000, { idempotencyKey: 'b' }); // 6 more → 12 > 10
  assert.equal(r1.ok, true);
  assert.equal(r2.ok, false, 'the open reservation counts against the cap');
});

test('settle is idempotent too — a retried settle does not double-book spend', async () => {
  const { credits } = await makeLedger(10);
  await credits.reserve('u1', 5000, { idempotencyKey: 'k' });
  await credits.settle('u1', 4000, { idempotencyKey: 'k' });
  await credits.settle('u1', 4000, { idempotencyKey: 'k' }); // retry
  const snap = await credits.snapshot('u1');
  assert.deepEqual(snap, { reserved: 0, spent: 4 }, 'settled once');
});
