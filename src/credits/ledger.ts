/**
 * The quota ledger: real Postgres semantics for two-phase credit accounting.
 *
 * Schema decisions (from the forge-accounts spec):
 * - quota(user_id, day, reserved, spent) — the daily row IS the daily reset:
 *   a new day is a new row, so "no accumulation" is a property of the shape,
 *   not a cron job.
 * - credit_ledger with UNIQUE(idempotency_key) — exactly-once reserves:
 *   a retried request hits the constraint and replays the first verdict.
 * - Atomicity: FOR UPDATE row lock inside a transaction.
 *
 * Tests run this against pglite (real Postgres, WASM); production runs the
 * same SQL against the Railway Postgres plugin. The concurrency guarantee is
 * the SQL semantics — pglite is single-connection, so interleavings are
 * simulated with sequential transactions, not real parallelism (noted in the
 * spec's testing decisions).
 */

export interface LedgerConfig {
  /** Daily cap in points (external unit; never tokens). */
  dailyCap: number;
  /** Tokens per point — the only place tokens become points. */
  tokensPerPoint: number;
}

const DDL = `
CREATE TABLE IF NOT EXISTS quota (
  user_id  text NOT NULL,
  day      date NOT NULL,
  reserved int NOT NULL DEFAULT 0,
  spent    int NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, day)
);
CREATE TABLE IF NOT EXISTS bans (
  user_id   text PRIMARY KEY,
  reason    text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS credit_ledger (
  id              serial PRIMARY KEY,
  user_id         text NOT NULL,
  day             date NOT NULL,
  kind            text NOT NULL CHECK (kind IN ('reserve', 'settle')),
  amount          int NOT NULL,
  idempotency_key text NOT NULL UNIQUE,
  created_at      timestamptz NOT NULL DEFAULT now()
);
`;

/** Minimal Postgres surface both pglite and node-postgres satisfy. */
export interface SqlClient {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<{
    rows: T[];
  }>;
  transaction<T>(fn: (tx: SqlClient) => Promise<T>): Promise<T>;
}

export function toPoints(tokens: number, tokensPerPoint: number): number {
  return Math.ceil(tokens / tokensPerPoint);
}

function todayUtc(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}

function nextMidnightUtc(now = new Date()): string {
  const next = new Date(now);
  next.setUTCDate(next.getUTCDate() + 1);
  next.setUTCHours(0, 0, 0, 0);
  return next.toISOString();
}

interface ReserveRow { reserved: number; spent: number }

export class PostgresCredits {
  readonly #db: SqlClient;
  readonly #config: LedgerConfig;

  constructor(db: SqlClient, config: LedgerConfig) {
    this.#db = db;
    this.#config = config;
  }

  static async migrate(db: SqlClient): Promise<void> {
    // One statement per call — embedded Postgres rejects multi-statement text.
    for (const statement of DDL.split(';')) {
      const trimmed = statement.trim();
      if (trimmed.length > 0) await db.query(trimmed);
    }
  }

  async reserve(
    sessionId: string,
    estimatedTokens: number,
    opts?: { idempotencyKey?: string },
  ): Promise<{ ok: boolean; resetsAt?: string }> {
    const day = todayUtc();
    const points = toPoints(estimatedTokens, this.#config.tokensPerPoint);
    const key = opts?.idempotencyKey ?? `auto:${sessionId}:${day}:${Date.now()}:${Math.random()}`;

    // Idempotent replay: a retried request gets the first verdict, not a
    // second deduction.
    const seen = await this.#db.query<{ ok: boolean }>(
      `SELECT true AS ok FROM credit_ledger WHERE idempotency_key = $1 AND kind = 'reserve'`,
      [key],
    );
    if (seen.rows.length > 0) return { ok: true, resetsAt: nextMidnightUtc() };

    return this.#db.transaction(async (tx) => {
      await tx.query(
        `INSERT INTO quota (user_id, day) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [sessionId, day],
      );
      const current = await tx.query<ReserveRow>(
        `SELECT reserved, spent FROM quota WHERE user_id = $1 AND day = $2 FOR UPDATE`,
        [sessionId, day],
      );
      const row = current.rows[0]!;
      if (row.reserved + row.spent + points > this.#config.dailyCap) {
        return { ok: false, resetsAt: nextMidnightUtc() };
      }
      await tx.query(
        `UPDATE quota SET reserved = reserved + $3 WHERE user_id = $1 AND day = $2`,
        [sessionId, day, points],
      );
      await tx.query(
        `INSERT INTO credit_ledger (user_id, day, kind, amount, idempotency_key)
         VALUES ($1, $2, 'reserve', $3, $4)`,
        [sessionId, day, -points, key],
      );
      return { ok: true, resetsAt: nextMidnightUtc() };
    });
  }

  async settle(
    sessionId: string,
    actualTokens: number,
    opts?: { idempotencyKey?: string },
  ): Promise<void> {
    const day = todayUtc();
    const actualPoints = toPoints(actualTokens, this.#config.tokensPerPoint);
    const reserveKey = opts?.idempotencyKey;
    if (!reserveKey) return; // nothing to release without a matching reserve

    const settleKey = `${reserveKey}:settle`;
    const seen = await this.#db.query(
      `SELECT 1 FROM credit_ledger WHERE idempotency_key = $1`,
      [settleKey],
    );
    if (seen.rows.length > 0) return;

    await this.#db.transaction(async (tx) => {
      const reserve = await tx.query<{ amount: number }>(
        `SELECT amount FROM credit_ledger WHERE idempotency_key = $1 AND kind = 'reserve'`,
        [reserveKey],
      );
      if (reserve.rows.length === 0) return;
      const reservedPoints = -reserve.rows[0]!.amount;

      // Release the reservation, book the actual spend. The difference is
      // implicitly refunded: reserved going down IS quota coming back.
      await tx.query(
        `UPDATE quota SET reserved = GREATEST(reserved - $3, 0), spent = spent + $4
         WHERE user_id = $1 AND day = $2`,
        [sessionId, day, reservedPoints, actualPoints],
      );
      await tx.query(
        `INSERT INTO credit_ledger (user_id, day, kind, amount, idempotency_key)
         VALUES ($1, $2, 'settle', $3, $4)`,
        [sessionId, day, actualPoints, settleKey],
      );
    });
  }

  async isBanned(userId: string): Promise<boolean> {
    const r = await this.#db.query(`SELECT 1 FROM bans WHERE user_id = $1`, [userId]);
    return r.rows.length > 0;
  }

  async ban(userId: string, reason = ''): Promise<void> {
    await this.#db.query(
      `INSERT INTO bans (user_id, reason) VALUES ($1, $2) ON CONFLICT (user_id) DO UPDATE SET reason = $2`,
      [userId, reason],
    );
  }

  async unban(userId: string): Promise<void> {
    await this.#db.query(`DELETE FROM bans WHERE user_id = $1`, [userId]);
  }

  async listBans(): Promise<{ user_id: string; reason: string }[]> {
    const r = await this.#db.query<{ user_id: string; reason: string }>(
      `SELECT user_id, reason FROM bans ORDER BY created_at DESC`,
    );
    return r.rows;
  }

  /** Admin aggregates: active identities and today's settled generations. */
  async dailyStats(
    day = todayUtc(),
  ): Promise<{ activeUsers: number; generations: number }> {
    const users = await this.#db.query<{ n: string }>(
      `SELECT COUNT(DISTINCT user_id) AS n FROM credit_ledger WHERE day = $1`,
      [day],
    );
    const gens = await this.#db.query<{ n: string }>(
      `SELECT COUNT(*) AS n FROM credit_ledger WHERE day = $1 AND kind = 'settle'`,
      [day],
    );
    return {
      activeUsers: Number(users.rows[0]?.n ?? 0),
      generations: Number(gens.rows[0]?.n ?? 0),
    };
  }

  /** Introspection for the admin panel and tests. */
  async snapshot(
    sessionId: string,
    day = todayUtc(),
  ): Promise<{ reserved: number; spent: number } | null> {
    const r = await this.#db.query<ReserveRow>(
      `SELECT reserved, spent FROM quota WHERE user_id = $1 AND day = $2`,
      [sessionId, day],
    );
    return r.rows[0] ?? null;
  }
}
