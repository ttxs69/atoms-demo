import pg from 'pg';
import { config } from 'dotenv';
import { lookup } from 'dns/promises';
config({ path: '.env' });
const u = new URL(process.env.APPS_SUPABASE_DB_URL);
const { address } = await lookup(u.hostname, { family: 4 });
const c = new pg.Client({
  host: address, port: +u.port, user: u.username,
  password: decodeURIComponent(u.password), database: u.pathname.slice(1),
  ssl: { rejectUnauthorized: false },
});
try {
  await c.connect();
  // GoTrue 的 anon users enabled 通过 JWT signing + 客户端 anon signIn
  // 实际：SQL 没有 anon enable 字段。Supabase hosted 默认 disabled anonymous signups
  // 必须用 dashboard 启用——所以这个方案有 gap
  console.log('SQL 改不了——需要 dashboard Enable Anonymous Sign-Ins');
} finally { await c.end(); }
