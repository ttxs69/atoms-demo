import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let platformCached: SupabaseClient | null = null;
let appsCached: SupabaseClient | null = null;

/**
 * 单一 Supabase 项目 = APPS（gzbjqtvipsuubmynxhdl）—— 账号 + 项目 + 应用数据。
 * platformSupabase() 用 secret（服务端），appsSupabase() 同项目同 secret。
 */

export function platformSupabase(): SupabaseClient {
  if (platformCached) return platformCached;
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

/**
 * 从请求 cookie 读 access token。forge_session 有两种历史格式：
 * JSON 包装（{access_token,...}，otp/verify 设的）或裸 JWT（/api/auth/session 设的）。
 * 所有读 cookie 的路由必须走这里——不要再各自 JSON.parse。
 */
export function readAccessToken(request: Request): string | null {
  const cookie = request.headers.get('cookie') ?? '';
  const match = cookie.match(/forge_session=([^;]+)/);
  if (!match || !match[1]) return null;
  const raw = decodeURIComponent(match[1]);
  try {
    const parsed = JSON.parse(raw) as { access_token?: string };
    return parsed.access_token ?? null;
  } catch {
    return raw; // 裸 JWT
  }
}