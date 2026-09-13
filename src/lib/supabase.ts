import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let cached: SupabaseClient | null = null;

/** 平台 Supabase（账号/credits/turnstile/Auth）—— 这个用 anon key */
export function platformSupabase(): SupabaseClient {
  if (cached) return cached;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) throw new Error('NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY not set');
  cached = createClient(url, anonKey, {
    auth: { persistSession: false }, // 服务端不用 session
  });
  return cached;
}

/** APPS Supabase（生成应用数据 + 项目数据）—— 同样 anon key，但 URL 不同 */
let appsCached: SupabaseClient | null = null;
export function appsSupabase(): SupabaseClient {
  if (appsCached) return appsCached;
  const url = process.env['APPS_SUPABASE_URL'];
  const anonKey = process.env['APPS_SUPABASE_PUBLISHABLE_KEY'];
  if (!url || !anonKey) throw new Error('APPS_SUPABASE_URL / APPS_SUPABASE_PUBLISHABLE_KEY not set');
  appsCached = createClient(url, anonKey, {
    auth: { persistSession: false },
  });
  return appsCached;
}
