import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

export async function POST() {
  return new NextResponse(JSON.stringify({ ok: true }), {
    status: 200,
    headers: {
      'content-type': 'application/json',
      'set-cookie': 'forge_session=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0',
    },
  });
}