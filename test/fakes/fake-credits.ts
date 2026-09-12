import type { CreditsPort } from '../../src/ports/credits-port.ts';

/**
 * Two-phase credit accounting, in memory.
 *
 * Set `reserveSucceeds: false` to drive the `blocked_credits` path — ticket 08
 * asserts that when reservation fails, not a single `write_file` happens.
 */
export class FakeCredits implements CreditsPort {
  readonly reservations: { sessionId: string; estimatedTokens: number }[] = [];
  readonly settlements: { sessionId: string; actualTokens: number }[] = [];

  #reserveSucceeds: boolean;

  constructor(options: { reserveSucceeds?: boolean } = {}) {
    this.#reserveSucceeds = options.reserveSucceeds ?? true;
  }

  async reserve(sessionId: string, estimatedTokens: number): Promise<{ ok: boolean }> {
    this.reservations.push({ sessionId, estimatedTokens });
    return { ok: this.#reserveSucceeds };
  }

  async settle(sessionId: string, actualTokens: number): Promise<void> {
    this.settlements.push({ sessionId, actualTokens });
  }
}
