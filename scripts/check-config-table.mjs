import pg from 'pg';
import { config } from 'dotenv';
config({ path: '.env' });

import { lookup } from 'dns/promises';
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
  // 找 email 域名限制配置
  const r = await c.query(`
    SELECT n.nspname, c.relname, a.attname
    FROM pg_constraint con
    JOIN pg_class c ON con.conrelid = c.oid
    JOIN pg_namespace n ON c.relnamespace = n.oid
    JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum = ANY(con.conkey)
    WHERE con.contype = 'c' AND n.nspname = 'auth'
      AND pg_get_constraintdef(con.oid) ILIKE '%email%'
    LIMIT 10
  `);
  console.log('constraints:', r.rows);
  
  // auth.users 表的 email 字段定义
  const col = await c.query(`
    SELECT column_name, data_type, udt_name 
    FROM information_schema.columns 
    WHERE table_schema = 'auth' AND table_name = 'users'
  `);
  console.log('users cols:', col.rows);
} catch (e) {
  console.error('err:', e.message);
} finally {
  await c.end();
}
