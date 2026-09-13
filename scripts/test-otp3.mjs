import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
config({ path: '.env' });

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false }});

// 查 auth.users 表看触发拒信的原因
const users = await sb.from('auth.users').select('id, email, banned_until, created_at').limit(5).catch(() => null);
console.log('users:', users);

// 查 auth.identities 看邮箱验证状态
const identities = await sb.from('auth.identities').select('*').limit(5).catch(() => null);
console.log('identities:', identities);
