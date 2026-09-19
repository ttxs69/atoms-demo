import { test } from 'node:test';
import assert from 'node:assert/strict';

import { supabaseJournal } from '../src/journal/supabase-journal.ts';
import { supabaseSnapshot } from '../src/ports/supabase-snapshot.ts';
import type { JournalRecord } from '../src/journal/fold.ts';

/**
 * Adapter tests behind a hand-rolled PostgREST-ish double — the repo's
 * established boundary pattern (FakeSandbox / FakeModel / FakeCredits).
 *
 * What this locks: the idempotent delete-then-insert order, the seq cursor,
 * and lossless record→row→record mapping. What it CANNOT lock: real column
 * names / schema drift — that is the e2e round trip's job (docs/04 §7).
 */

interface Row {
  seq: number;
  project_id: string;
  turn_id: string;
  message_id: string | null;
  kind: string;
  payload: JournalRecord;
}

/** The chained subset of supabase-js the adapters actually use:
 * filters attach AFTER .delete()/.select() — the builder is thenable and
 * executes once awaited, exactly like PostgrestFilterBuilder. */
function fakeEventsDb() {
  const rows: Row[] = [];
  let nextSeq = 1;
  return {
    rows,
    client: {
      from(table: string) {
        assert.equal(table, 'project_events');
        const eqs: Record<string, unknown> = {};
        let gtSeq: number | undefined;
        let op: 'delete' | 'select' | null = null;
        const matches = () =>
          rows
            .filter((r) => Object.entries(eqs).every(([c, v]) => (r as unknown as Record<string, unknown>)[c] === v))
            .filter((r) => gtSeq === undefined || r.seq > gtSeq)
            .sort((a, b) => a.seq - b.seq);
        const execute = async (): Promise<unknown> => {
          if (op === 'delete') {
            for (const row of matches()) rows.splice(rows.indexOf(row), 1);
            return undefined;
          }
          return { data: matches(), error: null };
        };
        const chain = {
          eq(col: string, val: unknown) {
            eqs[col] = val;
            return chain;
          },
          gt(col: string, val: number) {
            if (col === 'seq') gtSeq = val;
            return chain;
          },
          order() {
            return chain;
          },
          delete() {
            op = 'delete';
            return chain;
          },
          select() {
            op = 'select';
            return chain;
          },
          insert(newRows: Omit<Row, 'seq'>[]) {
            for (const row of newRows) rows.push({ seq: nextSeq++, ...row });
            return { error: null };
          },
          then(onFulfilled?: unknown, onRejected?: unknown) {
            return Promise.resolve(execute()).then(
              onFulfilled as never,
              onRejected as never,
            );
          },
        };
        return chain;
      },
    } as unknown as Parameters<typeof supabaseJournal>[0],
  };
}

const turnA: JournalRecord[] = [
  { kind: 'user_message', messageId: null, text: '做个应用' },
  {
    kind: 'agent_message',
    messageId: 'msg-1',
    agentHandle: 'eng',
    text: '写好了',
    files: [{ path: 'src/App.tsx', bytes: 900 }],
    errors: [],
    creditsUsed: 120,
    aborted: false,
  },
];

test('appendTurn → replay round-trips losslessly, seq ascending', async () => {
  const db = fakeEventsDb();
  const journal = supabaseJournal(db.client);

  await journal.appendTurn('p1', 'turn-1', turnA);

  const replayed = await journal.replay('p1');
  assert.equal(replayed.length, 2);
  assert.deepEqual(replayed[0]!.payload, turnA[0]);
  assert.deepEqual(replayed[1]!.payload, turnA[1]);
  assert.deepEqual(
    replayed.map((r) => r.seq).sort((a, b) => a - b),
    replayed.map((r) => r.seq), // insertion order == seq order
  );
  assert.equal(replayed[1]!.messageId, 'msg-1');
});

test('re-appending the same turn rewrites, never duplicates', async () => {
  const db = fakeEventsDb();
  const journal = supabaseJournal(db.client);

  await journal.appendTurn('p1', 'turn-1', turnA);
  await journal.appendTurn('p1', 'turn-1', turnA); // retry after dropped connection

  assert.equal(db.rows.length, 2);
  // And another turn appends after it, not over it.
  await journal.appendTurn('p1', 'turn-2', [turnA[0]!]);
  assert.equal(db.rows.length, 3);
  assert.deepEqual(new Set(db.rows.map((r) => r.turn_id)), new Set(['turn-1', 'turn-2']));
});

test('replay(afterSeq) returns only the tail — the cursor contract', async () => {
  const db = fakeEventsDb();
  const journal = supabaseJournal(db.client);

  await journal.appendTurn('p1', 'turn-1', turnA);
  const first = await journal.replay('p1');
  const cursor = first[first.length - 1]!.seq;
  await journal.appendTurn('p1', 'turn-2', [turnA[0]!]);

  const tail = await journal.replay('p1', cursor);
  assert.equal(tail.length, 1);
  assert.equal(tail[0]!.payload.kind, 'user_message');
  // Cross-project isolation through the same db.
  const other = await journal.replay('p2');
  assert.equal(other.length, 0);
});

function fakeStorageDb(downloadResult: { data?: { text: () => Promise<string> }; error?: unknown }) {
  return {
    storage: {
      from(bucket: string) {
        assert.equal(bucket, 'project-snapshots');
        return {
          download: async () => downloadResult,
          upload: async () => ({ error: null }),
        };
      },
    },
  } as unknown as Parameters<typeof supabaseSnapshot>[0];
}

test('snapshot load parses JSON to a file map', async () => {
  const snapshot = supabaseSnapshot(
    fakeStorageDb({ data: { text: async () => JSON.stringify({ 'src/App.tsx': 'x' }) } }),
    {} as never,
  );
  assert.deepEqual(await snapshot.load('w1'), new Map([['src/App.tsx', 'x']]));
});

test('snapshot load degrades to null on missing or corrupt objects', async () => {
  const missing = supabaseSnapshot(fakeStorageDb({ error: { message: 'not found' } }), {} as never);
  assert.equal(await missing.load('w1'), null);

  const corrupt = supabaseSnapshot(
    fakeStorageDb({ data: { text: async () => '{not json' } }),
    {} as never,
  );
  assert.equal(await corrupt.load('w1'), null);
});
