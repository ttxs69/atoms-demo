import 'server-only';
import { NextResponse } from 'next/server';
import { platformSupabase, appsSupabase, readAccessToken } from '@/lib/supabase.ts';

export const runtime = 'nodejs';

/**
 * GET /api/projects/:id/events?after=<seq> — conversation replay
 * (docs/04 §3.2). The seq cursor is the sequence-number contract: a client
 * holding a cursor asks only for what came after it.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const accessToken = readAccessToken(request);
  if (!accessToken) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const { data } = await platformSupabase().auth.getUser(accessToken);
  const userId = data.user?.id ?? null;
  if (!userId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const { id } = await params;

  // Ownership first — the service client bypasses RLS, so the check is ours.
  const { data: project } = await appsSupabase()
    .from('projects')
    .select('id')
    .eq('id', id)
    .eq('user_id', userId)
    .single();
  if (!project) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const after = Number(new URL(request.url).searchParams.get('after') ?? '0');

  // 读路径顺手刷新 last_opened_at——项目列表的“最近”排序依据。旧路径
  // （详情 GET bump）随详情页退役，归位到这里。
  void appsSupabase()
    .from('projects')
    .update({ last_opened_at: new Date().toISOString() })
    .eq('id', id);

  let query = appsSupabase()
    .from('project_events')
    .select('seq, kind, message_id, payload')
    .eq('project_id', id)
    .order('seq');
  if (Number.isFinite(after) && after > 0) query = query.gt('seq', after);

  const { data: events, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ events: events ?? [] });
}
