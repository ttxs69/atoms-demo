import { SESSION_COOKIE, sessionVerifierFromEnv } from '../../../../auth/session.ts';
import { captchaFromEnv } from '../../../../auth/captcha.ts';

export const runtime = 'nodejs';

/**
 * Establish the anonymous session: the client has silently signed in with
 * Supabase (anonymous, zero forms) and posts its access token; the server
 * validates it (Turnstile-checked) and sets the httpOnly cookie the
 * generate route trusts. Identity is server-established from here on.
 */
export async function POST(request: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Body must be JSON.' }, { status: 400 });
  }

  const { accessToken, turnstileToken } = (body ?? {}) as {
    accessToken?: unknown;
    turnstileToken?: unknown;
  };
  if (typeof accessToken !== 'string' || accessToken.length === 0) {
    return Response.json({ error: 'accessToken is required.' }, { status: 400 });
  }

  // Turnstile guards anonymous sign-in against scripted account farming
  // (Supabase's own strong recommendation for anonymous endpoints).
  if (typeof turnstileToken === 'string' && turnstileToken.length > 0) {
    const ok = await captchaFromEnv().verify(turnstileToken);
    if (!ok) {
      return Response.json({ error: '人机验证未通过，请重试。' }, { status: 403 });
    }
  }

  const verifier = sessionVerifierFromEnv();
  const userId = await verifier.verify(
    new Request('https://forge.internal', {
      headers: {
        cookie: `${SESSION_COOKIE}=${encodeURIComponent(accessToken)}`,
        'x-forwarded-for': request.headers.get('x-forwarded-for') ?? '',
      },
    }),
  );
  if (!userId) {
    return Response.json({ error: 'Invalid token.' }, { status: 401 });
  }

  const secure = process.env.NODE_ENV === 'production' ? ' Secure;' : '';
  return new Response(JSON.stringify({ userId }), {
    status: 200,
    headers: {
      'content-type': 'application/json',
      'set-cookie': `${SESSION_COOKIE}=${encodeURIComponent(accessToken)}; HttpOnly; Path=/; SameSite=Lax;${secure} Max-Age=2592000`,
    },
  });
}
