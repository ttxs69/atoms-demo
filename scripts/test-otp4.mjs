import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
config({ path: '.env' });

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false }});

// 实际有效的域名
const r = await sb.auth.signInWithOtp({ email: 'sarace.test@gmail.com', options: { shouldCreateUser: true }});
console.log('result:', JSON.stringify(r, null, 2));
