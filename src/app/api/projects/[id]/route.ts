import 'server-only';
import { NextResponse } from 'next/server';
import { platformSupabase, appsSupabase, readAccessToken } from '@/lib/supabase.ts';
import { syncProjectFiles } from '@/ports/supabase-snapshot.ts';

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

  const { data: initialFiles } = await appsSupabase()
    .from('project_files')
    .select('path, bytes, storage_key')
    .eq('project_id', id);
  let files = initialFiles;

  // 自愈回填：存量项目在 syncProjectFiles 上线前生成，manifest 从未写入过
  // （header 计数来自快照、清单来自 project_files——两代混读的残留）。
  // 计数说有文件而清单为空 → 从已提交的快照镜像一次；幂等，首次触发后
  // 再也不进这个分支。失败不影响 GET（下次再看时重试）。
  if ((files ?? []).length === 0 && (project.file_count ?? 0) > 0) {
    try {
      await syncProjectFiles(appsSupabase(), id, project.user_id);
      const { data: backfilled } = await appsSupabase()
        .from('project_files')
        .select('path, bytes, storage_key')
        .eq('project_id', id);
      files = backfilled ?? files;
    } catch (e) {
      console.error('project files backfill failed:', e);
    }
  }

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