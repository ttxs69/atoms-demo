import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
config({ path: '.env' });

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false }});

const r = await sb.auth.signInWithOtp({
  email: 'sarace.test@gmail.com',
  options: { shouldCreateUser: true },
});
console.log('signInWithOtp result:', JSON.stringify(r, null, 2));

// 然后查 admin audit log
const sbAdmin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false }});
const logs = await sbAdmin.from('audit_log_entries')
  .select('instance_id, payload, created_at')
  .order('created_at', { ascending: false })
  .limit(5);
console.log('\nAudit log:', JSON.stringify(logs.data, null, 2));
