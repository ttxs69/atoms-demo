import pg from 'pg';
import { config } from 'dotenv';
import { lookup } from 'dns/promises';
config({ path: '.env' });

const u = new URL(process.env.APPS_SUPABASE_DB_URL);
const { address } = await lookup(u.hostname, { family: 4 });

const c = new pg.Client({
  host: address,
  port: +u.port,
  user: u.username,
  password: decodeURIComponent(u.password),
  database: u.pathname.slice(1),
  ssl: { rejectUnauthorized: false },
});

await c.connect();
// 查 projects 表 RLS 状态
const rls = await c.query(`
  SELECT relname, relrowsecurity, relforcerowsecurity
  FROM pg_class
  WHERE relname IN ('projects', 'project_files', 'project_events', 'otp_codes')
`);
console.log('rls status:', rls.rows);
// 查 projects 表的 policy
const policies = await c.query(`
  SELECT tablename, policyname, cmd, qual
  FROM pg_policies
  WHERE schemaname = 'public' AND tablename IN ('projects', 'project_files')
`);
console.log('policies:', policies.rows);
await c.end();
