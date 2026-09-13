import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * 单一 Supabase 项目 = APPS（gzbjqtvipsuubmynxhdl），承担账号 + projects + 应用数据。
 * Railway env 里 SUPABASE_URL/SECRET/ANON 都指向 APPS，所以下面前两个函数
 * 和老的 supabase 客户端是同一个连接。
 */
let platformCached: SupabaseClient | null = null;
let appsCached: SupabaseClient | null = null;

export function platformSupabase(): SupabaseClient {
  if (platformCached) return platformCached;
  // 优先 APPS（auth + projects 同一个），fallback SUPABASE_*
  const url = process.env['APPS_SUPABASE_URL'] ?? process.env['SUPABASE_URL'];
  const secretKey = process.env['APPS_SUPABASE_SECRET_KEY'] ?? process.env['SUPABASE_SECRET_KEY'];
  if (!url || !secretKey) throw new Error('SUPABASE_URL / SUPABASE_SECRET_KEY not set');
  platformCached = createClient(url, secretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return platformCached;
}

export function appsSupabase(): SupabaseClient {
  if (appsCached) return appsCached;
  const url = process.env['APPS_SUPABASE_URL'];
  const secretKey = process.env['APPS_SUPABASE_SECRET_KEY'];
  if (!url || !secretKey) throw new Error('APPS_SUPABASE_URL / APPS_SUPABASE_SECRET_KEY not set');
  appsCached = createClient(url, secretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return appsCached;
}
