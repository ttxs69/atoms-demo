/**
 * Port: credits.
 *
 * Two-phase accounting: `reserve` pre-deducts before the run starts (a failed
 * reservation sends the run down the `blocked_credits` path), `settle` trues up
 * to actual usage afterward and refunds any over-reservation.
 *
 * `Credit` is the external abstraction shown to the user; internal accounting is
 * precise token measurement. See CONTEXT.md.
 */
export interface CreditsPort {
  reserve(
    sessionId: string,
    estimatedTokens: number,
  ): Promise<{ ok: boolean; /** ISO time when the quota resets, shown to the user. */ resetsAt?: string }>;
  settle(sessionId: string, actualTokens: number): Promise<void>;
}
