import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { readAccessToken } from '@/lib/supabase.ts';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const accessToken = readAccessToken(request);
  if (!accessToken) return NextResponse.json({ user: null });

  const sb = createClient(
    process.env['APPS_SUPABASE_URL']!,
    process.env['APPS_SUPABASE_PUBLISHABLE_KEY']!,
    { auth: { persistSession: false } },
  );
  const { data, error } = await sb.auth.getUser(accessToken);
  if (error || !data.user) return NextResponse.json({ user: null });
  return NextResponse.json({
    user: { id: data.user.id, email: data.user.email },
  });
}
