import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
config({ path: '.env' });

const sb = createClient(process.env.APPS_SUPABASE_URL, process.env.APPS_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false } });

const r = await sb.auth.signInAnonymously();
console.log('signInAnonymously result:', JSON.stringify(r, null, 2));
