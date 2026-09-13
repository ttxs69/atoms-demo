import pg from 'pg';
import { config } from 'dotenv';
import { lookup } from 'dns/promises';
import { readFileSync } from 'fs';
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

try {
  await c.connect();
  const sql = readFileSync(process.argv[2], 'utf8');
  await c.query(sql);
  console.log('✓ migration applied');
} catch (e) {
  console.error('err:', e.message);
} finally {
  await c.end();
}
