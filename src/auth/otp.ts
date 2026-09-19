/**
 * OTP core (FP) — all decisions pure, time injected.
 *
 * The routes (imperative shell) parse requests, touch the DB and Supabase,
 * and translate these verdicts into HTTP. Every branch here is unit-locked
 * in test/otp.test.ts, including the exact boundaries (expiry is strict <,
 * attempts are checked BEFORE the code match).
 */

export const OTP_TTL_MS = 10 * 60_000;
export const OTP_MAX_ATTEMPTS = 5;

/** Normalize an email-ish input; null when it cannot be one. */
export function normalizeEmail(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  const email = input.trim().toLowerCase();
  return email.includes('@') && email.length > 0 ? email : null;
}

/** A trimmed 6-digit code, or null. */
export function parseCode(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  const code = input.trim();
  return /^\d{6}$/.test(code) ? code : null;
}

export interface OtpRow {
  code: string;
  expires_at: string;
  attempts: number;
}

export type OtpCheck =
  | { verdict: 'ok' }
  | { verdict: 'bad_code'; nextAttempts: number }
  | { verdict: 'expired' }
  | { verdict: 'too_many_attempts' };

/**
 * The verify decision, in the shell's original order: expiry, then attempt
 * budget, then the code itself. `now` is injected so tests pin boundaries.
 */
export function checkOtp(row: OtpRow, code: string, now: Date): OtpCheck {
  if (new Date(row.expires_at) < now) return { verdict: 'expired' };
  if (row.attempts >= OTP_MAX_ATTEMPTS) return { verdict: 'too_many_attempts' };
  if (row.code !== code) return { verdict: 'bad_code', nextAttempts: row.attempts + 1 };
  return { verdict: 'ok' };
}

export interface SessionTokens {
  access_token: string;
  refresh_token: string;
  /** Optional in Supabase's Session type; the key drops out of the JSON
   * wrapper exactly as the original inline code did. */
  expires_at?: number;
}

/**
 * The forge_session cookie line. Byte-format matters: readAccessToken
 * (lib/supabase.ts) parses this exact JSON wrapper.
 */
export function sessionCookie(session: SessionTokens, opts: { secure: boolean }): string {
  const value = encodeURIComponent(
    JSON.stringify({
      access_token: session.access_token,
      refresh_token: session.refresh_token,
      expires_at: session.expires_at,
    }),
  );
  return `forge_session=${value}; HttpOnly; Path=/; SameSite=Lax; Max-Age=2592000${opts.secure ? '; Secure' : ''}`;
}
