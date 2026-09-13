/**
 * RLS template injection and the no-RLS detector (forge-app-backend ticket 01).
 *
 * The platform's isolation guarantee lives here as PURE FUNCTIONS: the
 * model's migration SQL is rewritten so that every created table carries the
 * workspace column, RLS, revoked grants, and the platform policy — appended
 * AFTER the model's SQL, so nothing the model writes can remove them.
 *
 * The official lesson this encodes: "adding policies doesn't remove grants"
 * (Supabase docs) — a REVOKE is mandatory, a policy alone is not security.
 */

export interface InjectedMigration {
  /** The model's SQL with the platform template appended per created table. */
  sql: string;
  /** Tables the template was applied to. */
  tables: string[];
}

const CREATE_TABLE_RE =
  /CREATE\s+TABLE\s+(IF\s+NOT\s+EXISTS\s+)?((?:"[^"]+"|[A-Za-z_][\w$]*)\.)?(?:"([^"]+)"|([A-Za-z_][\w$]*))\s*\(/gi;

/** Table names the migration creates, in order. Throws on zero matches. */
export function extractCreatedTables(sql: string): string[] {
  const tables: string[] = [];
  CREATE_TABLE_RE.lastIndex = 0;
  for (const m of sql.matchAll(CREATE_TABLE_RE)) {
    const table = (m[3] ?? m[4]) as string;
    tables.push(table);
  }
  if (tables.length === 0) {
    // 宁可失败也不静默漏注（spec 风险提醒第一条）。
    throw new Error('no CREATE TABLE statement found in migration');
  }
  return tables;
}

/**
 * Append the platform template for every created table. The model's own
 * statements (including its policies and grants) run FIRST; the template
 * runs LAST, so grants are revoked after being granted and the platform
 * policy exists no matter what the model wrote.
 */
export function injectRlsTemplate(sql: string, workspaceId: string): InjectedMigration {
  const tables = extractCreatedTables(sql);
  const blocks = tables.map((t) => templateFor(t, workspaceId));
  return {
    sql: `${sql.trim()}\n\n-- ==== platform template (appended; cannot be removed) ====\n${blocks.join('\n')}\n`,
    tables,
  };
}

function templateFor(table: string, workspaceId: string): string {
  return [
    `ALTER TABLE "${table}" ADD COLUMN IF NOT EXISTS workspace_id text NOT NULL DEFAULT '${workspaceId}';`,
    `ALTER TABLE "${table}" ENABLE ROW LEVEL SECURITY;`,
    `REVOKE ALL ON "${table}" FROM anon, authenticated;`,
    `CREATE POLICY "workspace_isolation_${table}" ON "${table}"`,
    `  USING (workspace_id = '${workspaceId}');`,
  ].join('\n');
}

export interface TableSecurity {
  name: string;
  rlsEnabled: boolean;
}

export interface RlsCheckFailure {
  code: string;
  detail: string;
}

/**
 * The second opinion (spec: double insurance): given the FINAL table
 * security state (from pg_tables or the advisor), any table without RLS is
 * a hard failure naming the table. This covers the rls_disabled_in_public
 * case the local advisor CLI is known to miss (supabase issue #5868).
 */
export function detectRlsGaps(tables: readonly TableSecurity[]): RlsCheckFailure[] {
  return tables
    .filter((t) => !t.rlsEnabled)
    .map((t) => ({
      code: 'RLS_DISABLED',
      detail: `table "${t.name}" has no row level security`,
    }));
}
