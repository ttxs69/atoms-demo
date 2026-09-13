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
    eng: [
      writeTurn({ 'package.json': '{}' }),
      done,
      writeTurn({ 'package.json': '{"fix":1}' }),
      done,
      writeTurn({ 'package.json': '{"fix":2}' }),
      done,
      writeTurn({ 'package.json': '{"fix":3}' }),
      done,
    ],
  });

  const events = await collect(orchestrator.run('s-fail-build', 'go'));

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

// ─── ticket 05: bounded self-repair on build failure ──────────────────────

/** An eng turn that just talks (used for scripted fix rounds). */
const chatter = (text: string): ScriptedTurn => [{ type: 'text', delta: text }];

test('build fails through all repair rounds: autofix runs, then gave_up — files survive', async () => {
  const sandbox = new FakeSandbox();
  sandbox.failCommand(/run build/, 'TS2304: Cannot find name "TodoItem" — src/App.tsx:14', 99);
  const orchestrator = makeOrchestrator(sandbox, {
    eng: [
      writeTurn({ 'src/App.tsx': 'broken' }),
      done,
      writeTurn({ 'src/App.tsx': 'fix 1' }),
      done,
      writeTurn({ 'src/App.tsx': 'fix 2' }),
      done,
      writeTurn({ 'src/App.tsx': 'fix 3' }),
      done,
    ],
  });

  const events = await collect(orchestrator.run('s-giveup', 'make an app'));

  const builds = events.filter(
    (e) => e.type === 'run_step' && e.step === 'building',
  ).length;
  const fixes = events.filter(
    (e) => e.type === 'run_step' && e.step === 'autofixing',
  ).length;
  const gaveUp = events.find(
    (e): e is Extract<StreamEvent, { type: 'error' }> =>
      e.type === 'error' && e.message.includes('未能通过'),
  );

  assert.equal(builds, 4, 'initial build + one per repair round');
  assert.equal(fixes, 3, 'three repair rounds — the promised count');
  assert.ok(gaveUp, 'gave_up error surfaces');
  assert.ok(gaveUp.message.includes('下一步建议'), 'carries a next-step suggestion');
  assert.ok(gaveUp.message.includes('文件都保留'), 'says files survive');
  assert.ok(!events.some((e) => e.type === 'run_step' && e.step === 'preview_ready'));
  // Content — not just paths — survives the failures.
  const sid = [...sandbox.files.keys()][0]!;
  assert.equal(await sandbox.readFile(sid, 'src/App.tsx'), 'fix 3');
  assert.equal(sandbox.paused.size, 1, 'gave_up still pauses');
});

test('a repair round that writes nothing gives up immediately instead of rebuilding', async () => {
  const sandbox = new FakeSandbox();
  sandbox.failCommand(/run build/, 'boom', 99);
  const orchestrator = makeOrchestrator(sandbox, {
    eng: [writeTurn({ 'src/App.tsx': 'v1' }), done, chatter('I see no problem')],
  });

  const events = await collect(orchestrator.run('s-nofix', 'go'));

  const builds = events.filter(
    (e) => e.type === 'run_step' && e.step === 'building',
  ).length;
  assert.equal(builds, 1, 'the unproductive round is the only one — no rebuild of identical code');
  assert.ok(events.some((e) => e.type === 'error' && e.message.includes('未能通过')));
});

test('build fails twice then passes: repair continues to a live preview', async () => {
  const sandbox = new FakeSandbox();
  sandbox.failCommand(/run build/, 'TS2304: first failure', 2);
  const orchestrator = makeOrchestrator(sandbox, {
    eng: [
      writeTurn({ 'src/App.tsx': 'v1' }),
      done,
      writeTurn({ 'src/App.tsx': 'v2' }),
      done,
      writeTurn({ 'src/App.tsx': 'v3' }),
      done,
    ],
  });

  const events = await collect(orchestrator.run('s-recovered', 'go'));

  assert.ok(events.some((e) => e.type === 'run_step' && e.step === 'preview_ready'));
  assert.equal(sandbox.paused.size, 1);
  const fixes = events.filter(
    (e) => e.type === 'run_step' && e.step === 'autofixing',
  ).length;
  assert.equal(fixes, 2);
});

test('the fix turn receives the raw build error in its prompt', async () => {
  const sandbox = new FakeSandbox();
  sandbox.failCommand(/run build/, 'TS2304: Cannot find name "TodoItem"', 1);
  const model = new FakeModel({
    pm: planTurn(['src/App.tsx']),
    eng: [writeTurn({ 'src/App.tsx': 'x' }), done, writeTurn({ 'src/App.tsx': 'fixed' }), done],
  });
  const orchestrator = createOrchestrator({ sandbox, model, credits: new FakeCredits() });

  await collect(orchestrator.run('s-ctx', 'go'));

  const fixCall = model.calls
    .filter((c) => c.agentHandle === 'eng')
    .find((c) => JSON.stringify(c.messages).includes('TS2304'));
  assert.ok(fixCall, 'a fix turn saw the raw error');
});

test('autofixing events carry the attempt number and the raw error', async () => {
  const sandbox = new FakeSandbox();
  sandbox.failCommand(/run build/, 'boom-1', 1);
  const orchestrator = makeOrchestrator(sandbox, {
    eng: [writeTurn({ 'src/App.tsx': 'x' }), done, writeTurn({ 'src/App.tsx': 'fixed' }), done],
  });

  const events = await collect(orchestrator.run('s-attempt', 'go'));
  const fix = events.find(
    (e): e is Extract<StreamEvent, { type: 'run_step' }> =>
      e.type === 'run_step' && e.step === 'autofixing',
  ) as unknown as { attempt: number; error: string } | undefined;

  assert.ok(fix, 'autofixing event present');
  assert.equal(fix!.attempt, 1);
  assert.ok(fix!.error.includes('boom-1'), 'raw error travels with the event');
});

// ─── ticket 06: interrupt without losing work ─────────────────────────────

test('abort mid-generation: files kept, interrupted event, settle, no pipeline', async () => {
  const sandbox = new FakeSandbox();
  const credits = new FakeCredits();
  const model = new FakeModel({
    pm: planTurn(['a.txt', 'b.txt', 'c.txt']),
    eng: [writeTurn({ 'a.txt': 'one' }), writeTurn({ 'b.txt': 'two' }), writeTurn({ 'c.txt': 'three' })],
  });
  const orchestrator = createOrchestrator({ sandbox, model, credits });
  const controller = new AbortController();

  const events: StreamEvent[] = [];
  const stream = orchestrator.run('s-stop', 'make things', { signal: controller.signal });
  for await (const event of stream) {
    events.push(event);
    // Abort on the first FILE WRITE result — pm's plan_files doesn't count.
    const result = event.type === 'tool_result' ? (event.result as { path?: string }) : null;
    if (result?.path) controller.abort();
  }

  assert.ok(events.some((e) => e.type === 'interrupted'), 'interrupt surfaces');
  // First file landed before the abort and survives.
  assert.ok(sandbox.allPaths().includes('a.txt'), 'written file kept');
  // No install/build ran — the app is incomplete, the pipeline is skipped.
  assert.ok(!sandbox.commands.some((c) => c.cmd.startsWith('npm install')));
  // Settlement happened (actual usage; token metering lands with ticket 08).
  assert.equal(credits.settlements.length, 1);
  // The turn still closes cleanly.
  assert.ok(events.some((e) => e.type === 'agent_done'));
  assert.equal(sandbox.paused.size, 1, 'sandbox pauses even when interrupted');
});

test('the turn after an interrupt knows where it stopped', async () => {
  const sandbox = new FakeSandbox();
  const model = new FakeModel({
    pm: planTurn(['a.txt']),
    // turn 1: one write then we abort; turn 2 continues
    eng: [writeTurn({ 'a.txt': 'one' }), [{ type: 'text', delta: '继续' }]],
  });
  const orchestrator = createOrchestrator({ sandbox, model, credits: new FakeCredits() });
  const controller = new AbortController();

  const it = orchestrator.run('s-resume', 'go', { signal: controller.signal })[Symbol.asyncIterator]();
  let ev = await it.next();
  while (!ev.done) {
    if (ev.value.type === 'tool_result') { controller.abort(); }
    ev = await it.next();
  }

  await collect(orchestrator.run('s-resume', '继续刚才的'));

  const secondEng = model.calls.filter((c) => c.agentHandle === 'eng')[1];
  assert.ok(
    secondEng && JSON.stringify(secondEng.messages).includes('中断'),
    'next prompt carries the interruption marker',
  );
});

// ─── ticket 07: multi-turn edits ───────────────────────────────────────────

test('turn 2 modifies only what changed; untouched files byte-identical; install skipped', async () => {
  const sandbox = new FakeSandbox();
  const orchestrator = makeOrchestrator(sandbox, {
    eng: [
      writeTurn({ 'src/App.tsx': 'v1-original', 'src/components/A.tsx': 'aaa' }),
      done,
      writeTurn({ 'src/App.tsx': 'v2-changed' }),
      done,
    ],
  });

  await collect(orchestrator.run('s-iter', '做一个应用'));
  await collect(orchestrator.run('s-iter', '改成三列'));

  const sid = [...sandbox.files.keys()][0]!;
  // 未被要求改动的文件保持逐字节不变（ticket 03 实测发现的破坏性重写）
  assert.equal(await sandbox.readFile(sid, 'src/components/A.tsx'), 'aaa');
  assert.equal(await sandbox.readFile(sid, 'src/App.tsx'), 'v2-changed');
  // 第二轮没有新依赖 → 只 install 一次
  const installs = sandbox.commands.filter((c) => c.cmd.startsWith('npm install')).length;
  assert.equal(installs, 1, 'install runs on the first turn only');
  // 两轮各 build 一次
  const builds = sandbox.commands.filter((c) => c.cmd.includes('run build')).length;
  assert.equal(builds, 2);
});

test('turn 2 that touches package.json reinstalls', async () => {
  const sandbox = new FakeSandbox();
  const orchestrator = makeOrchestrator(sandbox, {
    eng: [
      writeTurn({ 'src/App.tsx': 'v1' }),
      done,
      writeTurn({ 'package.json': '{"deps":"new"}', 'src/App.tsx': 'v2' }),
      done,
    ],
  });

  await collect(orchestrator.run('s-dep', 'go'));
  await collect(orchestrator.run('s-dep', '加个图表库'));

  const installs = sandbox.commands.filter((c) => c.cmd.startsWith('npm install')).length;
  assert.equal(installs, 2, 'package.json changed → install again');
});

test('turn 2 prompt carries the current file manifest', async () => {
  const sandbox = new FakeSandbox();
  const model = new FakeModel({
    pm: planTurn(['src/App.tsx']),
    eng: [
      writeTurn({ 'src/App.tsx': 'const x = 1;' }),
      done,
      writeTurn({ 'src/App.tsx': 'const x = 2;' }),
      done,
    ],
  });
  const orchestrator = createOrchestrator({ sandbox, model, credits: new FakeCredits() });

  await collect(orchestrator.run('s-ctx2', 'go'));
  await collect(orchestrator.run('s-ctx2', '再改一下'));

  const secondTurnEng = model.calls
    .filter((c) => c.agentHandle === 'eng')
    .find((c) => JSON.stringify(c.messages).includes('再改一下'));
  const prompt = JSON.stringify(secondTurnEng?.messages ?? []);
  assert.ok(secondTurnEng, 'found the turn-2 eng call');
  assert.ok(prompt.includes('src/App.tsx'), 'manifest lists the file');
  assert.ok(prompt.includes('const x = 1;'), 'manifest carries current CONTENT');
});

// ─── ticket 08: credits gate & input edges ────────────────────────────────

test('failed reservation blocks the run before anything happens', async () => {
  const sandbox = new FakeSandbox();
  const credits = new FakeCredits({ reserveSucceeds: false });
  const orchestrator = createOrchestrator({ sandbox, model: new FakeModel({}), credits });

  const events = await collect(orchestrator.run('s-broke', 'make an app'));

  assert.ok(events.some((e) => e.type === 'blocked_credits'), 'blocked event surfaces');
  assert.ok(!events.some((e) => e.type === 'tool_call_start'), 'not a single tool call');
  assert.equal(sandbox.files.size, 0, 'no sandbox created for a blocked run');
  assert.equal(sandbox.commands.length, 0);
  assert.equal(sandbox.paused.size, 0);
});

test('a successful run reserves at start and settles at the end', async () => {
  const credits = new FakeCredits();
  const orchestrator = createOrchestrator({
    sandbox: new FakeSandbox(),
    model: new FakeModel({
      pm: planTurn(['src/App.tsx']),
      eng: [writeTurn({ 'src/App.tsx': 'x' }), done],
    }),
    credits,
  });

  await collect(orchestrator.run('s-meter', 'go'));

  assert.equal(credits.reservations.length, 1, 'reserved once');
  assert.equal(credits.settlements.length, 1, 'settled once');
});

// ─── ticket 11: gate failure stops and waits — never auto-retries ─────────

test('a failed gate stops the run: no build, no autofix, files kept, gate_failed surfaces', async () => {
  const sandbox = new FakeSandbox();
  const gate = {
    check: async () =>
      ({ ok: false, code: 'LINT_0024_PERMISSIVE_RLS_POLICY', detail: 'table: notes — policy USING (true)' }) as const,
  };
  const model = new FakeModel({
    pm: planTurn(['src/App.tsx']),
    eng: [writeTurn({ 'src/App.tsx': 'x', 'migrations/001.sql': 'CREATE TABLE notes...' }), done],
  });
  const orchestrator = createOrchestrator({
    sandbox,
    model,
    credits: new FakeCredits(),
    gate,
  });

  const events = await collect(orchestrator.run('s-gate', 'make a notes app'));

  const gateFailed = events.find((e): e is Extract<StreamEvent, { type: 'gate_failed' }> => e.type === 'gate_failed');
  assert.ok(gateFailed, 'gate_failed event surfaces');
  assert.ok(gateFailed.code.includes('LINT_0024'), 'carries the policy code');
  assert.ok(events.some((e) => e.type === 'gate_started'), 'gate_started announces the check');

  // THE invariant: nothing after the failure — no build, no autofixing.
  const idx = events.findIndex((e) => e.type === 'gate_failed');
  const after = events.slice(idx + 1);
  assert.ok(!after.some((e) => e.type === 'run_step' && (e.step === 'building' || e.step === 'autofixing')),
    'no build, no autofix after gate_failed');
  assert.ok(!after.some((e) => e.type === 'error'), 'not the generic error path');

  // Files (including the migration that failed the gate) are preserved.
  assert.ok(sandbox.allPaths().includes('migrations/001.sql'));
  assert.equal(sandbox.paused.size, 1, 'still pauses');
});

test('a passing gate continues to build', async () => {
  const orchestrator = createOrchestrator({
    sandbox: new FakeSandbox(),
    model: new FakeModel({
      pm: planTurn(['src/App.tsx']),
      eng: [writeTurn({ 'src/App.tsx': 'x' }), done],
    }),
    credits: new FakeCredits(),
    gate: { check: async (_ctx) => ({ ok: true }) as const },
  });

  const events = await collect(orchestrator.run('s-gateok', 'go'));
  assert.ok(events.some((e) => e.type === 'run_step' && e.step === 'building'));
  assert.ok(events.some((e) => e.type === 'run_step' && e.step === 'preview_ready'));
});

test('the turn after a gate failure carries the rewrite context', async () => {
  const sandbox = new FakeSandbox();
  const model = new FakeModel({
    pm: [...planTurn(['src/App.tsx']), ...planTurn(['src/App.tsx'])],
    eng: [
      writeTurn({ 'src/App.tsx': 'x' }),
      done,
      writeTurn({ 'src/App.tsx': 'safe' }),
      done,
    ],
  });
  // 有状态门控：第一次失败，之后放行
  let firstCall = true;
  const orchestrator = createOrchestrator({
    sandbox,
    model,
    credits: new FakeCredits(),
    gate: {
      check: async (_ctx) =>
        firstCall
          ? ((firstCall = false), { ok: false as const, code: 'LINT_0024', detail: 'notes USING(true)' })
          : { ok: true as const },
    },
  });

  await collect(orchestrator.run('s-rewrite', 'make a notes app'));
  await collect(orchestrator.run('s-rewrite', '让 Alex 重写'));

  const rewriteCall = model.calls
    .filter((c) => c.agentHandle === 'eng')
    .find((c) => JSON.stringify(c.messages).includes('LINT_0024'));
  assert.ok(rewriteCall, 'the gate finding travels into the rewrite prompt');
});

// ─── ticket 02: token metering is real ────────────────────────────────────

test('usage chunks flow into settle and agent_done', async () => {
  const credits = new FakeCredits();
  const orchestrator = createOrchestrator({
    sandbox: new FakeSandbox(),
    model: new FakeModel({
      pm: [[{ type: 'text', delta: 'plan' }, ...PLAN_DONE], [{ type: 'text', delta: 'ok' }]],
      eng: [
        [
          { type: 'usage', input: 100, output: 200 },
          { type: 'tool_call_start', toolCallId: 't1', toolName: 'write_file' },
          { type: 'tool_input_delta', toolCallId: 't1', argsDelta: '{"path":"src/App.tsx","content":"x"}' },
          { type: 'tool_call_end', toolCallId: 't1' },
          { type: 'usage', input: 50, output: 150 },
        ],
        [{ type: 'text', delta: 'done' }, { type: 'usage', input: 10, output: 20 }],
      ],
    }),
    credits,
  });

  const events = await collect(orchestrator.run('s-usage', 'go'));

  assert.equal(credits.settlements[0]?.actualTokens, 530, '100+200+50+150+10+20');
  const done = events.find((e) => e.type === 'agent_done' && e.agentHandle === 'eng');
  assert.equal((done as { creditsUsed: number }).creditsUsed, 530);
});
const PLAN_DONE = [{ type: 'tool_call_start' as const, toolCallId: 'p1', toolName: 'plan_files' }, { type: 'tool_input_delta' as const, toolCallId: 'p1', argsDelta: '{"files":["src/App.tsx"],"description":"d"}' }, { type: 'tool_call_end' as const, toolCallId: 'p1' }];

// ─── forge-app-backend 02: migrations → migrating → gating ────────────────

test('a migration file routes through migrating; the gate receives INJECTED SQL', async () => {
  const sandbox = new FakeSandbox();
  const seen: { sql?: string; workspaceId?: string }[] = [];
  const model = new FakeModel({
    pm: planTurn(['src/App.tsx', 'supabase/migrations/001.sql']),
    eng: [
      writeTurn({
        'src/App.tsx': 'x',
        'supabase/migrations/001.sql': 'CREATE TABLE notes (id int, body text);',
      }),
      done,
    ],
  });
  const orchestrator = createOrchestrator({
    sandbox,
    model,
    credits: new FakeCredits(),
    gate: {
      check: async (ctx) => {
        if (ctx.migrationSql !== undefined) seen.push({ sql: ctx.migrationSql });
        if (ctx.workspaceId !== undefined) {
          const last = seen[seen.length - 1];
          if (last) last.workspaceId = ctx.workspaceId;
        }
        return { ok: true } as const;
      },
    },
  });

  const events = await collect(orchestrator.run('ws-mig', 'make a notes app'));

  const seq = events
    .filter((e) => e.type === 'run_step')
    .map((e) => (e as { step: string }).step);
  assert.ok(seq.includes('migrating'), 'migrating step fires');
  assert.ok(seq.indexOf('migrating') < seq.indexOf('building'), 'gating precedes build');
  assert.ok(seen[0]?.sql?.includes('platform template'), 'gate saw injected SQL');
  assert.ok(seen[0]?.sql?.includes('CREATE TABLE notes'), 'model SQL preserved inside');
  assert.equal(seen[0]?.workspaceId, 'ws-mig');
  assert.ok(events.some((e) => e.type === 'run_step' && e.step === 'preview_ready'));
});

test('no migrations → no migrating step (pipeline unchanged)', async () => {
  const orchestrator = makeOrchestrator(new FakeSandbox(), {
    eng: [writeTurn({ 'src/App.tsx': 'x' }), done],
  });
  const events = await collect(orchestrator.run('s-nomig', 'go'));
  assert.ok(!events.some((e) => e.type === 'run_step' && (e as { step: string }).step === 'migrating'));
});

// ─── ticket 04: build-time env injection for persistent apps ──────────────

test('with APPS_SUPABASE configured, the pipeline writes VITE_ env into the sandbox', async () => {
  process.env['APPS_SUPABASE_URL'] = 'https://apps.supabase.co';
  process.env['APPS_SUPABASE_PUBLISHABLE_KEY'] = 'pk-test';
  try {
    const sandbox = new FakeSandbox();
    const orchestrator = makeOrchestrator(sandbox, {
      eng: [writeTurn({ 'src/App.tsx': 'x' }), done],
    });
    await collect(orchestrator.run('ws-env', 'go'));
    const sid = [...sandbox.files.keys()][0]!;
    const env = await sandbox.readFile(sid, '.env');
    assert.ok(env.includes('VITE_SUPABASE_URL=https://apps.supabase.co'));
    assert.ok(env.includes('VITE_SUPABASE_PUBLISHABLE_KEY=pk-test'));
    assert.ok(env.includes('VITE_WORKSPACE_ID=ws-env'));
    assert.ok(!env.includes('SECRET'), 'secret key never lands in the sandbox');
  } finally {
    delete process.env['APPS_SUPABASE_URL'];
    delete process.env['APPS_SUPABASE_PUBLISHABLE_KEY'];
  }
});

// ─── restart recovery: a NEW process adopts the old sandbox ────────────────

test('a fresh orchestrator (simulated restart) finds the old sandbox and iterates', async () => {
  const sandbox = new FakeSandbox();
  // 进程 A：完整首轮
  const first = createOrchestrator({
    sandbox,
    model: new FakeModel({
      pm: planTurn(['src/App.tsx']),
      eng: [writeTurn({ 'src/App.tsx': 'v1' }), done],
    }),
    credits: new FakeCredits(),
  });
  await collect(first.run('ws-keep', '做个应用'));
  const sandboxId1 = [...sandbox.files.keys()][0]!;

  // 进程 B：全新实例（内存 map 为空），同一 workspace id
  const model2 = new FakeModel({
    eng: [writeTurn({ 'src/App.tsx': 'v2' }), done],
  });
  const second = createOrchestrator({ sandbox, model: model2, credits: new FakeCredits() });
  const events = await collect(second.run('ws-keep', '改成三列'));

  assert.ok(!events.some((e) => e.type === 'plan_ready'), 'no re-plan: it iterates');
  assert.ok(!events.some((e) => e.type === 'error'), 'no errors');
  const sandboxId2 = [...sandbox.files.keys()][0]!;
  assert.equal(sandboxId2, sandboxId1, 'the SAME sandbox — not a new one');
  assert.equal(await sandbox.readFile(sandboxId2, 'src/App.tsx'), 'v2');
});
