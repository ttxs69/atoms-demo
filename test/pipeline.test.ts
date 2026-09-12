import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createOrchestrator } from '../src/orchestrator/orchestrator.ts';
import { FakeSandbox } from './fakes/fake-sandbox.ts';
import { FakeModel, type ScriptedTurn } from './fakes/fake-model.ts';
import { planTurn } from './fakes/plan-turn.ts';
import { FakeCredits } from './fakes/fake-credits.ts';
import type { StreamEvent } from '../src/domain/events.ts';

async function collect(stream: AsyncIterable<StreamEvent>) {
  const out: StreamEvent[] = [];
  for await (const event of stream) out.push(event);
  return out;
}

/** A closing text-only step: the generation loop ends when a step calls no tools. */
const done = [{ type: 'text' as const, delta: 'done' }];

/** A scripted eng turn that writes the given files. */
function writeTurn(files: Record<string, string>) {
  return Object.entries(files).map(([path, content], i) => [
    { type: 'tool_call_start' as const, toolCallId: `t${i}`, toolName: 'write_file' },
    {
      type: 'tool_input_delta' as const,
      toolCallId: `t${i}`,
      argsDelta: JSON.stringify({ path, content }),
    },
    { type: 'tool_call_end' as const, toolCallId: `t${i}` },
  ]).flat();
}

function makeOrchestrator(
  sandbox: FakeSandbox,
  turns: { eng: ScriptedTurn[]; pm?: ScriptedTurn[] },
) {
  // First turns plan by definition now; a default pm script keeps the older
  // tests honest about the new flow without repeating the plan everywhere.
  const pm = turns.pm ?? planTurn(['src/App.tsx']);
  return createOrchestrator({
    sandbox,
    model: new FakeModel({ ...turns, pm }),
    credits: new FakeCredits(),
  });
}

test('after writing files, orchestrator runs install then build then starts the dev server', async () => {
  const sandbox = new FakeSandbox();
  const orchestrator = makeOrchestrator(sandbox, {
    eng: [writeTurn({ 'package.json': '{}', 'src/App.tsx': 'x' }), done],
  });

  const events = await collect(orchestrator.run('s-pipeline', 'make an app'));

  const commands = sandbox.commands.map((c) => c.cmd);
  assert.ok(commands.some((c) => c.startsWith('npm install')), `install ran: ${commands}`);
  assert.ok(commands.some((c) => c.includes('run build')), `build ran: ${commands}`);
  // order: first install before first build
  assert.ok(commands.indexOf(commands.find((c) => c.startsWith('npm install'))!) <
             commands.indexOf(commands.find((c) => c.includes('run build'))!));
  assert.equal(sandbox.background.length, 1, 'dev server started in background');
  assert.ok(sandbox.background[0]?.cmd.includes('npm run dev'));
});

test('preview_ready transient event carries the preview URL', async () => {
  const sandbox = new FakeSandbox();
  const orchestrator = makeOrchestrator(sandbox, {
    eng: [writeTurn({ 'package.json': '{}' }), done],
  });

  const events = await collect(orchestrator.run('s-url', 'go'));
  const preview = events.find((e) => e.type === 'run_step' && e.step === 'preview_ready');

  assert.ok(preview, 'preview_ready emitted');
  assert.match((preview as { url: string }).url, /3000-fake-sandbox-1-s-url\.e2b\.app/);
});

test('sandbox is paused after the preview is ready', async () => {
  const sandbox = new FakeSandbox();
  const orchestrator = makeOrchestrator(sandbox, {
    eng: [writeTurn({ 'package.json': '{}' }), done],
  });

  await collect(orchestrator.run('s-pause', 'go'));

  assert.equal(sandbox.paused.size, 1);
});

test('install failure surfaces an error event and skips build', async () => {
  const sandbox = new FakeSandbox();
  sandbox.failCommand(/npm install/, 'network unreachable', 99);
  const orchestrator = makeOrchestrator(sandbox, {
    eng: [writeTurn({ 'package.json': '{}' }), done],
  });

  const events = await collect(orchestrator.run('s-fail-install', 'go'));

  assert.ok(events.some((e) => e.type === 'error' && e.message.includes('install')));
  assert.ok(!sandbox.commands.some((c) => c.cmd.includes('run build')), 'build skipped');
  assert.equal(sandbox.background.length, 0, 'no dev server started');
});

test('build failure surfaces an error event and skips the dev server', async () => {
  const sandbox = new FakeSandbox();
  sandbox.failCommand(/run build/, 'TS2304: Cannot find name', 99);
  const orchestrator = makeOrchestrator(sandbox, {
    eng: [writeTurn({ 'package.json': '{}' }), done],
  });

  const events = await collect(orchestrator.run('s-fail-build', 'go'))

  assert.ok(events.some((e) => e.type === 'error'));
  assert.equal(sandbox.background.length, 0);
  // A failed run still pauses: no burning paid runtime until the E2B timeout.
  assert.equal(sandbox.paused.size, 1);
  assert.ok(!events.some((e) => e.type === 'run_step' && e.step === 'preview_ready'));
});

test('a turn with no file writes skips the install/build pipeline entirely', async () => {
  const sandbox = new FakeSandbox();
  const orchestrator = makeOrchestrator(sandbox, {
    eng: [[{ type: 'text', delta: 'Just chatting.' }]],
  });

  await collect(orchestrator.run('s-chat', 'hi'));

  assert.equal(sandbox.commands.length, 0, 'no commands run');
  assert.equal(sandbox.background.length, 0);
  assert.equal(sandbox.paused.size, 0, 'no pause needed — nothing was generated');
});

test('run_step events mark installing and building along the way', async () => {
  const sandbox = new FakeSandbox();
  const orchestrator = makeOrchestrator(sandbox, {
    eng: [writeTurn({ 'package.json': '{}' }), done],
  });

  const events = await collect(orchestrator.run('s-steps', 'go'));
  const stepNames = events
    .filter((e): e is Extract<StreamEvent, { type: 'run_step' }> => e.type === 'run_step')
    .map((e) => e.step);

  assert.deepEqual(stepNames, ['installing', 'building', 'starting', 'preview_ready']);
});

test('first turn scaffolds the project; second turn does not rewrite it', async () => {
  const sandbox = new FakeSandbox();
  const orchestrator = makeOrchestrator(sandbox, {
    eng: [
      writeTurn({ 'src/App.tsx': 'a' }),
      done,
      [{ type: 'text', delta: 'second turn' }],
    ],
  });

  await collect(orchestrator.run('s-scaffold', 'go'));
  const afterFirst = sandbox.allPaths();
  assert.ok(afterFirst.includes('package.json'), 'scaffold laid on first turn');
  assert.ok(afterFirst.includes('src/App.tsx'), 'model file written');

  // second turn: overwrite package.json with a marker, run again, marker survives
  const id = [...sandbox.files.keys()][0]!;
  await sandbox.writeFile(id, 'package.json', '{"marker":true}');
  await collect(orchestrator.run('s-scaffold', 'again'));
  const content = await sandbox.readFile(id, 'package.json');
  assert.equal(content, '{"marker":true}', 'scaffold not rewritten on turn 2');
});

test('dev server that never answers produces an error, not preview_ready', async () => {
  const sandbox = new FakeSandbox();
  sandbox.probeNeverReady = true;
  const orchestrator = makeOrchestrator(sandbox, {
    eng: [writeTurn({ 'src/App.tsx': 'x' }), done],
  });

  const events = await collect(orchestrator.run('s-no-server', 'go'));

  assert.ok(events.some((e) => e.type === 'error' && e.message.includes('dev server')));
  assert.ok(!events.some((e) => e.type === 'run_step' && e.step === 'preview_ready'));
  assert.equal(sandbox.paused.size, 1, 'still pauses even when the server never answered');
});

// ─── ticket 04: Emma plans first, skeleton-first file tree ────────────────

test('first turn: pm plans, plan_ready precedes the first write_file', async () => {
  const sandbox = new FakeSandbox();
  const orchestrator = makeOrchestrator(sandbox, {
    pm: planTurn(['src/App.tsx', 'src/components/MoodCard.tsx']),
    eng: [writeTurn({ 'src/App.tsx': 'a' }), done],
  });

  const events = await collect(orchestrator.run('s-plan', 'make a mood app'));

  const types = events.map((e) => e.type);
  const planAt = types.indexOf('plan_ready');
  const firstWriteAt = events.findIndex(
    (e) => e.type === 'tool_call_start' && e.toolName === 'write_file',
  );
  assert.ok(planAt !== -1, 'plan_ready emitted');
  assert.ok(firstWriteAt !== -1, 'a write_file happened');
  assert.ok(planAt < firstWriteAt, 'plan_ready precedes the first write');

  const plan = events[planAt] as unknown as { files: string[] };
  assert.deepEqual(plan.files, ['src/App.tsx', 'src/components/MoodCard.tsx']);
});

test('first turn: pm runs then eng, each with their own started/done events', async () => {
  const sandbox = new FakeSandbox();
  const orchestrator = makeOrchestrator(sandbox, {
    pm: planTurn(['src/App.tsx']),
    eng: [writeTurn({ 'src/App.tsx': 'a' }), done],
  });

  const events = await collect(orchestrator.run('s-roles', 'go'));
  const seq = events
    .filter((e) => e.type === 'agent_started' || e.type === 'agent_done')
    .map((e) => `${e.type}:${e.agentHandle}`);

  assert.deepEqual(seq, ['agent_started:pm', 'agent_done:pm', 'agent_started:eng', 'agent_done:eng']);
});

test("Emma's plan is injected into Alex's prompt", async () => {
  const sandbox = new FakeSandbox();
  const model = new FakeModel({
    pm: planTurn(['src/App.tsx', 'src/theme.css'], 'A mood tracker.'),
    eng: [writeTurn({ 'src/App.tsx': 'a' }), done],
  });
  const orchestrator = createOrchestrator({
    sandbox,
    model,
    credits: new FakeCredits(),
  });

  await collect(orchestrator.run('s-inject', 'go'));

  const engCall = model.calls.find((c) => c.agentHandle === 'eng');
  const engPrompt = JSON.stringify(engCall?.messages ?? []);
  assert.ok(engPrompt.includes('src/App.tsx'), 'file list in eng prompt');
  assert.ok(engPrompt.includes('src/theme.css'), 'second file in eng prompt');
  assert.ok(engPrompt.includes('A mood tracker.'), 'description in eng prompt');
});

test('iterate turn (App.tsx exists): no pm, no plan_ready, straight to eng', async () => {
  const sandbox = new FakeSandbox();
  const model = new FakeModel({
    pm: planTurn(['src/App.tsx']),
    // turn 1 writes the app; turn 2 modifies it
    eng: [writeTurn({ 'src/App.tsx': 'v1' }), done, writeTurn({ 'src/App.tsx': 'v2' }), done],
  });
  const orchestrator = createOrchestrator({ sandbox, model, credits: new FakeCredits() });

  await collect(orchestrator.run('ws', '做一个应用'));
  const pmCallsAfterFirst = model.calls.filter((c) => c.agentHandle === 'pm').length;

  const events = await collect(orchestrator.run('ws', '改成三列'));

  assert.ok(!events.some((e) => e.type === 'plan_ready'), 'no plan on iterate turn');
  assert.equal(
    model.calls.filter((c) => c.agentHandle === 'pm').length,
    pmCallsAfterFirst,
    'pm not called again on the iterate turn',
  );
  assert.ok(events.some((e) => e.type === 'tool_call_start'), 'eng writes directly');
});

test('pm turn without a plan_files call falls through to eng (model variance tolerance)', async () => {
  const sandbox = new FakeSandbox();
  const orchestrator = makeOrchestrator(sandbox, {
    pm: [[{ type: 'text', delta: 'no plan from me' }], [{ type: 'text', delta: 'ok' }]],
    eng: [writeTurn({ 'src/App.tsx': 'a' }), done],
  });

  const events = await collect(orchestrator.run('s-noplan', 'go'));

  assert.ok(!events.some((e) => e.type === 'plan_ready'));
  assert.ok(events.some((e) => e.type === 'tool_result'), 'eng still wrote');
});

test('concurrent runs on one session serialize: pm plans exactly once', async () => {
  const sandbox = new FakeSandbox();
  const model = new FakeModel({
    pm: planTurn(['src/App.tsx']),
    // run1 eng: write; run2 eng: write again (iterate semantics)
    eng: [writeTurn({ 'src/App.tsx': 'v1' }), done, writeTurn({ 'src/App.tsx': 'v2' }), done],
  });
  const orchestrator = createOrchestrator({ sandbox, model, credits: new FakeCredits() });

  // Fire both without awaiting the first — the per-session queue must put
  // run2 behind run1's tail rather than racing appExists into double-planning.
  const p1 = collect(orchestrator.run('s-race', 'first'));
  const p2 = collect(orchestrator.run('s-race', 'second'));
  const [events1, events2] = await Promise.all([p1, p2]);

  const planCalls = [...events1, ...events2].filter(
    (e) => e.type === 'tool_call_start' && e.toolName === 'plan_files',
  ).length;
  assert.equal(planCalls, 1, 'only the first run plans');
  assert.ok(events2.some((e) => e.type === 'tool_result'), 'second run still wrote');
  assert.ok(!events2.some((e) => e.type === 'plan_ready'), 'second run is an iterate turn');
});
