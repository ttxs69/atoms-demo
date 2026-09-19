import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  OTP_MAX_ATTEMPTS,
  checkOtp,
  normalizeEmail,
  parseCode,
  sessionCookie,
} from '../src/auth/otp.ts';

/**
 * The OTP decision core, boundary-pinned. These are the branches e2e cannot
 * reach (they need clock control and brute-force loops): expiry edges, the
 * attempt budget, and its ordering BEFORE the code match.
 */

const ROW = { code: '123456', expires_at: '2026-01-01T00:10:00.000Z', attempts: 0 };
const BEFORE = new Date('2026-01-01T00:09:59.999Z');
const EXPIRY = new Date('2026-01-01T00:10:00.000Z');
const AFTER = new Date('2026-01-01T00:10:00.001Z');

test('checkOtp: correct code, in window, under budget → ok', () => {
  assert.deepEqual(checkOtp(ROW, '123456', BEFORE), { verdict: 'ok' });
});

test('checkOtp: expiry is strict — at the exact instant it still passes', () => {
  assert.equal(checkOtp(ROW, '123456', EXPIRY).verdict, 'ok');
  assert.equal(checkOtp(ROW, '123456', AFTER).verdict, 'expired');
});

test('checkOtp: expiry outranks a wrong code (no attempt burn on dead codes)', () => {
  assert.equal(checkOtp(ROW, '000000', AFTER).verdict, 'expired');
});

test('checkOtp: wrong code burns exactly one attempt', () => {
  const row = { ...ROW, attempts: 3 };
  assert.deepEqual(checkOtp(row, '000000', BEFORE), {
    verdict: 'bad_code',
    nextAttempts: 4,
  });
});

test('checkOtp: the budget is checked BEFORE the match — a correct code at the cap is rejected', () => {
  const row = { ...ROW, attempts: OTP_MAX_ATTEMPTS };
  assert.equal(checkOtp(row, '123456', BEFORE).verdict, 'too_many_attempts');
  // one below the cap, the correct code still passes
  const rowBelow = { ...ROW, attempts: OTP_MAX_ATTEMPTS - 1 };
  assert.equal(checkOtp(rowBelow, '123456', BEFORE).verdict, 'ok');
});

test('normalizeEmail: trims, lowercases, rejects junk', () => {
  assert.equal(normalizeEmail('  User@Example.COM '), 'user@example.com');
  assert.equal(normalizeEmail('no-at-sign'), null);
  assert.equal(normalizeEmail(''), null);
  assert.equal(normalizeEmail(42), null);
});

test('parseCode: six digits only, trimmed', () => {
  assert.equal(parseCode(' 123456 '), '123456');
  assert.equal(parseCode('12345'), null);
  assert.equal(parseCode('1234567'), null);
  assert.equal(parseCode('12345a'), null);
  assert.equal(parseCode(undefined), null);
});

test('sessionCookie: JSON wrapper round-trips through readAccessToken format', () => {
  const line = sessionCookie(
    { access_token: 'at', refresh_token: 'rt', expires_at: 123 },
    { secure: true },
  );
  assert.match(line, /^forge_session=/);
  assert.match(line, /HttpOnly; Path=\/; SameSite=Lax; Max-Age=2592000; Secure$/);

  const value = decodeURIComponent(line.slice('forge_session='.length).split(';')[0]!);
  assert.deepEqual(JSON.parse(value), {
    access_token: 'at',
    refresh_token: 'rt',
    expires_at: 123,
  });

  assert.equal(
    sessionCookie({ access_token: 'a', refresh_token: 'r', expires_at: 1 }, { secure: false })
      .endsWith('Max-Age=2592000'),
    true,
  );
});
