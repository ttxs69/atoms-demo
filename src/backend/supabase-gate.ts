import type { SqlClient } from '../credits/ledger.ts';
import type { GateContext, GatePort } from '../orchestrator/orchestrator.ts';
import { detectRlsGaps, type TableSecurity } from './rls-template.ts';

/**
 * Production gate (forge-app-backend ticket 03): execute the injected
 * migration inside a transaction against the SHARED Supabase project, then
 * verify every public table carries RLS. Any failure rolls the transaction
 * back — "已回滚，未对外暴露任何数据" is literal, not copy.
 *
 * The RLS verification is our own SQL over pg_tables (the second opinion the
 * spec demands): it covers rls_disabled_in_public, which the local advisor
 * CLI is known to miss (supabase issue #5868). When the online Security
 * Advisor API is wired additionally, error-level findings fail the gate and
 * warns only log — this detector stays regardless.
 *
 * Degraded mode: no APPS_SUPABASE_DB_URL configured → the gate passes and
 * says so (dev without the shared project must not crash; disclosed in the
 * ticket).
 */
export class SharedProjectGate implements GatePort {
  readonly #dbUrl: string | null;
  #db: SqlClient | null = null;
  #connected = false;

  constructor(db: SqlClient | null, dbUrl?: string) {
    this.#db = db;
    this.#dbUrl = dbUrl ?? null;
  }

  /**
   * Lazy connection: don't touch the shared project until a gate check
   * actually needs it. A hello-page generation (no migrations) never
   * connects — a 5432-unreachable host doesn't break the whole app.
   * When a migration IS present, the connection MUST succeed or the
   * gate FAILS (never skips the security check).
   */
  async #ensureDb(): Promise<SqlClient | null> {
    if (this.#connected) return this.#db;
    this.#connected = true;
    if (this.#db) return this.#db; // injected (tests)
    if (!this.#dbUrl) return null; // not configured
    const { Client } = await import('pg');
    const client = new Client({
      connectionString: this.#dbUrl,
      ssl: { rejectUnauthorized: false },
      // Railway doesn't support outbound IPv6; Supabase's pooler resolves
      // to IPv6 first. Force IPv4 or the connection silently fails.
    });
    await client.connect();
    const tx = async <T,>(fn: (c: import('../credits/ledger.ts').SqlClient) => Promise<T>): Promise<T> => {
      await client.query('BEGIN');
      try {
        const out = await fn(client as unknown as import('../credits/ledger.ts').SqlClient);
        await client.query('COMMIT');
        return out;
      } catch (e) {
        await client.query('ROLLBACK');
        throw e;
      }
    };
    const wrapped = client as unknown as import('../credits/ledger.ts').SqlClient & { transaction: typeof tx };
    wrapped.transaction = tx;
    this.#db = wrapped;
    return this.#db;
  }

  async check(ctx: GateContext): Promise<
    { ok: true } | { ok: false; code: string; detail: string }
  > {
    if (ctx.migrationSql === undefined) {
      return { ok: true }; // no migrations → gate doesn't apply
    }
    // Migrations ARE present: the gate MUST run. If the shared project
    // is unreachable, the gate FAILS — never silently skips security.
    let db: SqlClient | null;
    try {
      db = await this.#ensureDb();
    } catch (e) {
      return {
        ok: false,
        code: 'GATE_UNREACHABLE',
        detail: `安全门控数据库不可达，无法验证迁移安全性: ${e instanceof Error ? e.message : String(e)}`,
      };
    }
    if (!db) {
      return { ok: true }; // not configured (dev without shared project)
    }
    const thisDb = db;

    await thisDb.query('BEGIN');
    try {
      // Embedded Postgres rejects multi-statement text. Strip -- comment
      // lines FIRST (comments may contain semicolons that would otherwise
      // split mid-comment), then execute statement by statement.
      const noComments = ctx.migrationSql
        .split('\n')
        .filter((line) => !line.trim().startsWith('--'))
        .join('\n');
      for (const statement of noComments.split(';')) {
        const trimmed = statement.trim();
        if (trimmed.length > 0) {
          await thisDb.query(trimmed);
        }
      }

      const tables = await thisDb.query<{ tablename: string; rowsecurity: boolean }>(
        `SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname = 'public'`,
      );
      const gaps = detectRlsGaps(
        tables.rows.map<TableSecurity>((r) => ({ name: r.tablename, rlsEnabled: r.rowsecurity })),
      );
      if (gaps.length > 0) {
        await thisDb.query('ROLLBACK');
        return { ok: false, code: gaps[0]!.code, detail: gaps[0]!.detail };
      }
      await thisDb.query('COMMIT');
      return { ok: true };
    } catch (error) {
      await thisDb.query('ROLLBACK');
      return {
        ok: false,
        code: 'MIGRATION_FAILED',
        detail: error instanceof Error ? error.message.slice(0, 300) : String(error),
      };
    }
  }
}
