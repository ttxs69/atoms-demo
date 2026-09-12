import { test } from 'node:test';
import assert from 'node:assert/strict';

import { RUN_TRANSITIONS } from '../src/domain/run-state.ts';

/**
 * The state graph is a domain artifact with its own invariants. Testing it
 * directly is not "testing internals of run()" — it is testing the type that
 * describes the generation lifecycle.
 *
 * Ticket 11 (gate failure presentation) must add a behavioral test that drives
 * the orchestrator with a scripted gate-failure sequence and asserts that no
 * retry event appears in the stream. That test will be the seam-level proof;
 * the tests here are the structural proof that the edge cannot be added silently.
 */

test('gate_failed cannot reach autofixing', () => {
  // A gate failure means the generated data-isolation policy is unsafe.
  // Retrying automatically risks handing the user an app that looks successful
  // but is not. This is the one invariant in the graph that must not regress.
  const reachable = new Set<string>();
  const walk = (state: string): void => {
    if (reachable.has(state)) return;
    reachable.add(state);
    for (const next of RUN_TRANSITIONS[state as keyof typeof RUN_TRANSITIONS] ?? []) {
      walk(next);
    }
  };

  walk('gate_failed');

  assert.ok(!reachable.has('autofixing'), 'gate_failed must never lead to autofixing');
  assert.ok(!reachable.has('building'), 'gate_failed must not silently resume the build');
});

test('build failure can reach autofixing', () => {
  // The counterpart: a build failure is a technical problem, so self-repair is
  // the right response. ticket 05 asserts this through run() as well.
  assert.ok(RUN_TRANSITIONS.failed.includes('autofixing'));
  assert.ok(RUN_TRANSITIONS.autofixing.includes('building'));
});

test('every transition target is a declared state', () => {
  const declared = new Set(Object.keys(RUN_TRANSITIONS));
  for (const [from, targets] of Object.entries(RUN_TRANSITIONS)) {
    for (const to of targets) {
      assert.ok(declared.has(to), `${from} -> ${to}: "${to}" is not a declared state`);
    }
  }
});
