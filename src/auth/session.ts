import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Session identity for the generate route.
 *
 * The route never trusts client-declared sessionIds — identity comes from
 * the httpOnly session cookie, verified against the PLATFORM Supabase
 * project (not the generated-apps project; see CONTEXT.md's project/workspace
 * disambiguation and the forge-accounts spec).
 */
export interface SessionVerifier {
  /** Returns the user id, or null when the request carries no valid session. */
  verify(request: Request): Promise<string | null>;
}

export const SESSION_COOKIE = 'forge_session';

export class SupabaseVerifier implements SessionVerifier {
  readonly #url: string;
  readonly #anonKey: string;

  constructor(url: string, anonKey: string) {
    this.#url = url;
    this.#anonKey = anonKey;
  }

  async verify(request: Request): Promise<string | null> {
    const token = readSessionCookie(request.headers.get('cookie'));
    if (!token) return null;

    // Forward the caller's real IP so Supabase's IP rate limiting buckets
    // per-visitor, not per-proxy (forge-accounts spec; requires the secret
    // key server-side). getUser() takes no per-call options, so the header
    // rides on a per-verify client — cheap and correct.
    const forwarded = request.headers.get('x-forwarded-for') ?? undefined;
    const client: SupabaseClient = createClient(this.#url, this.#anonKey, {
      global: {
        headers: {
          ...(forwarded ? { 'Sb-Forwarded-For': forwarded } : {}),
          // The forwarded-IP header is only honored with the secret key.
          ...(process.env['SUPABASE_SECRET_KEY']
            ? { apikey: process.env['SUPABASE_SECRET_KEY'], Authorization: `Bearer ${process.env['SUPABASE_SECRET_KEY']}` }
            : {}),
        },
      },
    });

    const { data, error } = await client.auth.getUser(token);
    if (error || !data.user) return null;
    return data.user.id;
  }
}

/**
 * Development fallback when no platform Supabase project is configured:
 * accepts an explicit X-Dev-Session header so local flows work without
 * identity infrastructure. NEVER active when SUPABASE_URL is set.
 */
export class DevVerifier implements SessionVerifier {
  async verify(request: Request): Promise<string | null> {
    return request.headers.get('x-dev-session');
  }
}

export function readSessionCookie(cookieHeader: string | null): string | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(';')) {
    const [name, ...rest] = part.trim().split('=');
    if (name === SESSION_COOKIE) return decodeURIComponent(rest.join('='));
  }
  return null;
}

export function sessionVerifierFromEnv(): SessionVerifier {
  // 优先用 APPS（auth + projects 同 project），fallback 到老的 SUPABASE_URL
  const url = process.env['APPS_SUPABASE_URL'] ?? process.env['SUPABASE_URL'];
  const anonKey = process.env['APPS_SUPABASE_PUBLISHABLE_KEY'] ?? process.env['SUPABASE_ANON_KEY'];
  return url && anonKey ? new SupabaseVerifier(url, anonKey) : new DevVerifier();
}
