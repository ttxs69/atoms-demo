import 'server-only';
import { NextResponse } from 'next/server';
import { platformSupabase, appsSupabase, readAccessToken } from '@/lib/supabase.ts';

export const runtime = 'nodejs';

async function getUserId(request: Request): Promise<string | null> {
  const accessToken = readAccessToken(request);
  if (!accessToken) return null;
  const { data } = await platformSupabase().auth.getUser(accessToken);
  return data.user?.id ?? null;
}

/** GET /api/projects/:id —— 详情 + 文件列表 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const userId = await getUserId(request);
  if (!userId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const { id } = await params;

  const { data: project, error } = await appsSupabase()
    .from('projects')
    .select('*')
    .eq('id', id)
    .eq('user_id', userId)
    .single();

  if (error || !project) {
    return NextResponse.json({ error: error?.message ?? 'Not found' }, { status: 404 });
  }

  const { data: files } = await appsSupabase()
    .from('project_files')
    .select('path, bytes, storage_key')
    .eq('project_id', id);

  // 更新 last_opened_at
  await appsSupabase()
    .from('projects')
    .update({ last_opened_at: new Date().toISOString() })
    .eq('id', id);

  return NextResponse.json({ project, files: files ?? [] });
}

/** PATCH /api/projects/:id —— 改名 / 归档 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const userId = await getUserId(request);
  if (!userId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const { id } = await params;
  let body: { name?: string; status?: string };
  try {
    body = (await request.json()) as { name?: string; status?: string };
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (typeof body.name === 'string') updates['name'] = body.name.trim().slice(0, 80);
  if (typeof body.status === 'string' && ['draft', 'archived'].includes(body.status)) {
    updates['status'] = body.status;
  }

  const { error } = await appsSupabase()
    .from('projects')
    .update(updates)
    .eq('id', id)
    .eq('user_id', userId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

/** DELETE /api/projects/:id —— 软删除（status='archived'） */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const userId = await getUserId(request);
  if (!userId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const { id } = await params;
  const { error } = await appsSupabase()
    .from('projects')
    .update({ status: 'archived', updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('user_id', userId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}