import { NextResponse } from 'next/server';
import { platformSupabase } from '@/lib/supabase.ts';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const cookie = request.headers.get('cookie') ?? '';
  const match = cookie.match(/forge_session=([^;]+)/);
  if (!match || !match[1]) return NextResponse.json({ user: null });

  let parsed: { access_token?: string };
  try {
    parsed = JSON.parse(decodeURIComponent(match[1]));
  } catch {
    return NextResponse.json({ user: null });
  }
  if (!parsed.access_token) return NextResponse.json({ user: null });

  const { data, error } = await platformSupabase().auth.getUser(parsed.access_token);
  if (error || !data.user) return NextResponse.json({ user: null });
  return NextResponse.json({
    user: { id: data.user.id, email: data.user.email },
  });
}