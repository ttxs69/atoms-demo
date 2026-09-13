import 'server-only';
import { NextResponse } from 'next/server';
import { platformSupabase } from '@/lib/supabase.ts';
import { appsSupabase } from '@/lib/supabase.ts';

export const runtime = 'nodejs';

/** 从 cookie 拿 user_id */
async function getUserId(request: Request): Promise<string | null> {
  const cookie = request.headers.get('cookie') ?? '';
  const match = cookie.match(/forge_session=([^;]+)/);
  if (!match || !match[1]) return null;
  let parsed: { access_token?: string };
  try {
    parsed = JSON.parse(decodeURIComponent(match[1]));
  } catch {
    return null;
  }
  if (!parsed.access_token) return null;
  const { data } = await platformSupabase().auth.getUser(parsed.access_token);
  return data.user?.id ?? null;
}

/** GET /api/projects —— 当前用户的所有项目 */
export async function GET(request: Request) {
  const userId = await getUserId(request);
  if (!userId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const { data, error } = await appsSupabase()
    .from('projects')
    .select('id, name, status, preview_url, file_count, created_at, updated_at, last_opened_at')
    .eq('user_id', userId)
    .neq('status', 'archived')
    .order('last_opened_at', { ascending: false, nullsFirst: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ projects: data ?? [] });
}

/** POST /api/projects —— 新建项目（不带 sandbox，纯元数据） */
export async function POST(request: Request) {
  const userId = await getUserId(request);
  if (!userId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  let body: { name?: string };
  try {
    body = (await request.json()) as { name?: string };
  } catch {
    body = {};
  }
  const name = (body.name ?? '未命名项目').trim().slice(0, 80) || '未命名项目';

  const { data, error } = await appsSupabase()
    .from('projects')
    .insert({ user_id: userId, name, status: 'draft' })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ project: data });
}