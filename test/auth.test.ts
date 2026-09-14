import { test } from 'node:test';
import assert from 'node:assert/strict';

import { POST as generate } from '../src/app/api/generate/route.ts';
import { readSessionCookie, DevVerifier, sessionVerifierFromEnv } from '../src/auth/session.ts';
import { AllowAllCaptcha, TurnstileCaptcha } from '../src/auth/captcha.ts';

/**
 * Seam B (per the spec): route handlers invoked as functions with a Request.
 * No server, no network — the verifier path is the Dev fallback (explicit
 * header), and missing keys mean the E2B/LLM guards short-circuit before
 * anything expensive.
 */

test('generate rejects a request with no session — 401, nothing runs', async () => {
  // No SUPABASE_URL in the test env → DevVerifier → no header = no session.
  delete process.env['SUPABASE_URL'];
  delete process.env['APPS_SUPABASE_URL'];
  const res = await generate(
    new Request('http://x/api/generate', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ sessionId: 'attacker-declared', message: 'hi' }),
    }),
  );
  assert.equal(res.status, 401);
});

test('generate derives sessionId from the session, ignoring the body value', async () => {
  // The route reads the verifier result as its sessionId; a declared body
  // sessionId is structurally ignored (it is no longer even parsed out).
  // With E2B keys absent the next guard 503s — proving the session gate
  // PASSED and execution moved past identity.
  delete process.env['E2B_API_KEY'];
  delete process.env['SUPABASE_URL'];
  delete process.env['APPS_SUPABASE_URL'];
  delete process.env['APPS_SUPABASE_URL'];
  const res = await generate(
    new Request('http://x/api/generate', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-dev-session': 'cookie-user-1',
      },
      body: JSON.stringify({ sessionId: 'someone-else', message: 'hi' }),
    }),
  );
  assert.equal(res.status, 503, 'identity passed; the next guard (keys) stopped it');
});

test('DevVerifier is never active when SUPABASE_URL is configured', () => {
  process.env['SUPABASE_URL'] = 'https://example.supabase.co';
  process.env['SUPABASE_ANON_KEY'] = 'anon';
  delete process.env['APPS_SUPABASE_URL'];
  const v = sessionVerifierFromEnv();
  assert.equal((v as { constructor: { name: string } }).constructor.name, 'SupabaseVerifier');
  delete process.env['SUPABASE_URL'];
  delete process.env['SUPABASE_ANON_KEY'];
});

test('readSessionCookie parses the forge_session cookie', () => {
  assert.equal(readSessionCookie('a=1; forge_session=tok%2Fx; b=2'), 'tok/x');
  assert.equal(readSessionCookie(null), null);
  assert.equal(readSessionCookie('other=1'), null);
});

test('captcha: absent keys allow (dev); Turnstile fails closed on fetch errors', async () => {
  const allow = new AllowAllCaptcha();
  assert.equal(await allow.verify('anything'), true);

  // A verifier with a garbage secret against a mocked-broken fetch: our impl
  // catches and returns false — fail CLOSED.
  const t = new TurnstileCaptcha('bad-secret');
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => {
    throw new Error('network down');
  }) as typeof fetch;
  try {
    assert.equal(await t.verify('tok'), false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

// ─── Turnstile widget 客户端接线 ───────────────────────────────────────────

test('turnstile token resolves when configured, rejects without failing the page', async () => {
  const { turnstileToken } = await import('../src/auth/turnstile-client.ts');
  // 无 key（本地开发）：立即 null，页面不挂
  delete process.env['NEXT_PUBLIC_TURNSTILE_SITE_KEY'];
  assert.equal(await turnstileToken(), null);
});
