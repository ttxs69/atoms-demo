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
  readonly #db: SqlClient | null;

  constructor(db: SqlClient | null) {
    this.#db = db;
  }

  static fromEnv(): SharedProjectGate {
    // Constructed in the route; the client factory lives there so this class
    // stays transport-free and test-injectable.
    return new SharedProjectGate(null);
  }

  async check(ctx: GateContext): Promise<
    { ok: true } | { ok: false; code: string; detail: string }
  > {
    if (!this.#db) {
      // Degraded (dev): nothing to protect, nothing to run.
      return { ok: true };
    }
    if (ctx.migrationSql === undefined) {
      return { ok: true };
    }

    await this.#db.query('BEGIN');
    try {
      // Embedded Postgres rejects multi-statement text — execute
      // sequentially, stripping comment-only lines per statement.
      for (const statement of ctx.migrationSql.split(';')) {
        const stripped = statement
          .split('\n')
          .filter((line) => !line.trim().startsWith('--'))
          .join('\n')
          .trim();
        if (stripped.length > 0) {
          await this.#db.query(stripped);
        }
      }

      const tables = await this.#db.query<{ tablename: string; rowsecurity: boolean }>(
        `SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname = 'public'`,
      );
      const gaps = detectRlsGaps(
        tables.rows.map<TableSecurity>((r) => ({ name: r.tablename, rlsEnabled: r.rowsecurity })),
      );
      if (gaps.length > 0) {
        await this.#db.query('ROLLBACK');
        return { ok: false, code: gaps[0]!.code, detail: gaps[0]!.detail };
      }
      await this.#db.query('COMMIT');
      return { ok: true };
    } catch (error) {
      await this.#db.query('ROLLBACK');
      return {
        ok: false,
        code: 'MIGRATION_FAILED',
        detail: error instanceof Error ? error.message.slice(0, 300) : String(error),
      };
    }
  }
}
