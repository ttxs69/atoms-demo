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
  #resetsAt?: string;

  constructor(options: { reserveSucceeds?: boolean; resetsAt?: string } = {}) {
    this.#reserveSucceeds = options.reserveSucceeds ?? true;
    if (options.resetsAt !== undefined) this.#resetsAt = options.resetsAt;
  }

  async reserve(
    sessionId: string,
    estimatedTokens: number,
  ): Promise<{ ok: boolean; resetsAt?: string }> {
    this.reservations.push({ sessionId, estimatedTokens });
    return { ok: this.#reserveSucceeds, ...(this.#resetsAt ? { resetsAt: this.#resetsAt } : {}) };
  }

  async settle(sessionId: string, actualTokens: number): Promise<void> {
    this.settlements.push({ sessionId, actualTokens });
  }
}
