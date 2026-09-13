import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
config({ path: '.env' });

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false }});

// 实际登录邮箱
const emails = ['test1234@gmail.com', 'user@example.com', 'test@qq.com'];
for (const email of emails) {
  const r = await sb.auth.signInWithOtp({ email, options: { shouldCreateUser: true }});
  console.log(email, '→', r.error?.message ?? 'OK');
}
