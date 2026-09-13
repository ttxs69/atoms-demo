import pg from 'pg';
import { config } from 'dotenv';
import { lookup } from 'dns/promises';
config({ path: '.env' });

// 连接 APPS_SUPABASE 的 postgres 看（GoTrue 是 supabase 内部服务，它的 DB 在同一个 instance 但不同 schema/db）
// 实际上 GoTrue 在 auth.users/identities 这个数据库里（supabase 共享）
// 我们连接的是 APPS 项目的 db。APPS 项目的 DB 里也有 auth schema（supabase 在每个 project 里都有）

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

try {
  await c.connect();
  
  // 查 GoTrue 的模板表（不一定存在）
  const tables = await c.query(`
    SELECT table_schema, table_name 
    FROM information_schema.tables 
    WHERE (table_schema LIKE 'auth%' OR table_schema = 'public' OR table_schema LIKE 'gotrue%')
      AND (table_name LIKE '%template%' OR table_name LIKE '%config%')
    ORDER BY table_schema, table_name
  `);
  console.log('TABLES:', tables.rows);

  // 查 auth.users 字段
  const cols = await c.query(`
    SELECT column_name, data_type 
    FROM information_schema.columns 
    WHERE table_schema = 'auth' AND table_name = 'users'
    AND column_name IN ('email', 'raw_app_meta_data', 'raw_user_meta_data')
  `);
  console.log('auth.users cols:', cols.rows);

  // 找 templates（可能在 auth schema 里）
  const tmpls = await c.query(`
    SELECT n.nspname, c.relname, a.attname
    FROM pg_class c
    JOIN pg_namespace n ON c.relnamespace = n.oid
    JOIN pg_attribute a ON a.attrelid = c.oid
    WHERE n.nspname NOT IN ('pg_catalog', 'information_schema')
      AND c.relkind = 'r'
      AND a.attname ILIKE '%template%'
  `);
  console.log('template cols:', tmpls.rows);
} catch (e) {
  console.error('err:', e.message);
} finally {
  await c.end();
}
