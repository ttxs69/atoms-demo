import { PGlite } from '@electric-sql/pglite';
import { createHash } from 'node:crypto';
import { AsyncLocalStorage } from 'node:async_hooks';
import { PostgresCredits, type SqlClient } from './ledger.ts';
import type { CreditsPort } from '../ports/credits-port.ts';

/**
 * Route-level credit wiring.
 *
 * Dev/test: one pglite instance for the process (no DATABASE_URL).
 * Production: the Railway Postgres plugin via DATABASE_URL — same SQL,
 * real connections. The port is created once per process.
 */

let portPromise: Promise<PostgresCredits> | null = null;
let dbPromise: Promise<SqlClient & { transaction?: unknown }> | null = null;

/** The shared platform client — credits AND the GC queue live on it. */
export function ledgerDb(): Promise<SqlClient & { transaction?: unknown }> {
  dbPromise ??= createDb();
  return dbPromise;
}

async function createDb(): Promise<SqlClient & { transaction?: unknown }> {

  if (process.env['DATABASE_URL']) {
    // Lazy import keeps node-postgres out of the dev/test path.
    const { Client } = await import('pg');
    const client = new Client({ connectionString: process.env['DATABASE_URL'] });
    await client.connect();
    const tx = async <T,>(fn: (c: SqlClient) => Promise<T>): Promise<T> => {
      await client.query('BEGIN');
      try {
        const out = await fn(client as unknown as SqlClient);
        await client.query('COMMIT');
        return out;
      } catch (e) {
        await client.query('ROLLBACK');
        throw e;
      }
    };
    const wrapped = client as unknown as SqlClient & { transaction: typeof tx };
    wrapped.transaction = tx;
    return wrapped;
  }

  const db = new PGlite();
  const tx = async <T,>(fn: (c: SqlClient) => Promise<T>): Promise<T> => {
    await db.query('BEGIN');
    try {
      const out = await fn(db as unknown as SqlClient);
      await db.query('COMMIT');
      return out;
    } catch (e) {
      await db.query('ROLLBACK');
      throw e;
    }
  };
  const wrapped = db as unknown as SqlClient & { transaction: typeof tx };
  wrapped.transaction = tx;
  return wrapped;
}

async function createPort(): Promise<PostgresCredits> {
  const cap = Number(process.env['DAILY_CAP'] ?? '100');
  const tokensPerPoint = Number(process.env['TOKENS_PER_POINT'] ?? '10000');
  const db = await ledgerDb();
  await PostgresCredits.migrate(db);
  return new PostgresCredits(db, { dailyCap: cap, tokensPerPoint });
}

export function ledgerPort(): Promise<PostgresCredits> {
  portPromise ??= createPort();
  return portPromise;
}

/** The per-request idempotency key, carried by async context. */
const requestKey = new AsyncLocalStorage<string>();

/**
 * A stable CreditsPort for the orchestrator singleton that reads the CURRENT
 * request's idempotency key from async context. Retries of the same user
 * message dedupe in the ledger; different messages budget independently.
 * The orchestrator's seam signature stays untouched.
 */
export function requestScopedCredits(inner: PostgresCredits): CreditsPort {
  return {
    async reserve(sessionId, estimate) {
      const key = requestKey.getStore();
      return inner.reserve(sessionId, estimate, key ? { idempotencyKey: key } : {});
    },
    async settle(sessionId, actual) {
      const key = requestKey.getStore();
      await inner.settle(sessionId, actual, key ? { idempotencyKey: key } : {});
    },
  };
}

/** Wrap one request's execution with its idempotency key. */
export function withRequestKey<T>(key: string, fn: () => T): T {
  return requestKey.run(key, fn);
}

export function keyFor(sessionId: string, message: string): string {
  return `${sessionId}:${createHash('sha256').update(message).digest('hex').slice(0, 16)}`;
}
