import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createOrchestrator } from '../src/orchestrator/orchestrator.ts';
import { FakeSandbox } from './fakes/fake-sandbox.ts';
import { FakeModel, type ScriptedTurn } from './fakes/fake-model.ts';
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

function makeOrchestrator(sandbox: FakeSandbox, turns: { eng: ScriptedTurn[] }) {
  return createOrchestrator({
    sandbox,
    model: new FakeModel(turns),
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
