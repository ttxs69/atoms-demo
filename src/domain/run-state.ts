/**
 * The lifecycle of one generation run.
 *
 * Lifted from the runnable prototype (`prototypes/generation-loop.mjs`), which
 * exercised all six variants. Ticket 01 only reaches `understanding`; the rest
 * of the graph is expressed here because later tickets fill in these edges one
 * at a time.
 *
 * The load-bearing distinction in this graph is `building → failed →
 * autofixing` versus `gating → gate_failed`. A build failure is a technical
 * problem and self-repair is reasonable. A gate failure means the generated
 * data-isolation policy is unsafe, and retrying automatically risks masking
 * that. `gate_failed` must never lead to `autofixing`.
 */
export type RunState =
  | 'idle'
  | 'submitting'
  | 'blocked_credits'
  | 'reserving'
  | 'sandbox_booting'
  | 'understanding'
  | 'planning'
  | 'generating'
  | 'interrupted'
  | 'installing'
  | 'migrating'
  | 'gating'
  | 'gate_failed'
  | 'building'
  | 'failed'
  | 'autofixing'
  | 'gave_up'
  | 'previewing'
  | 'settling'
  | 'idle_iterate';

/**
 * Edges the run may take. The bounded retry cycles via
 * building → failed → autofixing → building (at most three repair rounds)
 * rather than through a self-edge.
 *
 * Note there is no edge from `gate_failed` to `autofixing`, and no edge from
 * `gate_failed` at all — a gate failure is terminal for the run and returns
 * control to the user.
 */
export const RUN_TRANSITIONS: Readonly<Record<RunState, readonly RunState[]>> = {
  idle: ['submitting'],
  submitting: ['reserving', 'blocked_credits'],
  blocked_credits: [],
  reserving: ['sandbox_booting'],
  sandbox_booting: ['understanding'],
  understanding: ['planning'],
  // Second round onward goes straight to `building`, skipping dependency
  // installation when no new dependencies were introduced.
  planning: ['generating'],
  generating: ['installing', 'building', 'interrupted'],
  interrupted: ['understanding'],
  installing: ['migrating', 'building'],
  migrating: ['gating'],
  gating: ['building', 'gate_failed'],
  gate_failed: [],
  building: ['previewing', 'failed'],
  failed: ['autofixing', 'gave_up'],
  autofixing: ['building', 'gave_up'],
  gave_up: [],
  previewing: ['settling'],
  settling: ['idle_iterate'],
  idle_iterate: ['submitting'],
};
