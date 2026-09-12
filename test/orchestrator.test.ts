import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createOrchestrator } from '../src/orchestrator/orchestrator.ts';
import { FakeSandbox } from './fakes/fake-sandbox.ts';
import { FakeModel } from './fakes/fake-model.ts';
import { planTurn } from './fakes/plan-turn.ts';
import { FakeCredits } from './fakes/fake-credits.ts';
import type { StreamEvent } from '../src/domain/events.ts';

async function collect(stream: AsyncIterable<StreamEvent>) {
  const out: StreamEvent[] = [];
  for await (const event of stream) out.push(event);
  return out;
}

test('run() streams agent_started then text_delta then agent_done', async () => {
  const orchestrator = createOrchestrator({
    sandbox: new FakeSandbox(),
    model: new FakeModel({
      pm: [[{ type: 'text', delta: 'Planning.' }]],
      eng: [[{ type: 'text', delta: 'Got it.' }]],
    }),
    credits: new FakeCredits(),
  });

  const events = await collect(orchestrator.run('session-1', 'make a hello page'));

  assert.deepEqual(
    events.map((event) => `${event.type}:${'agentHandle' in event ? event.agentHandle : ''}`),
    [
      'agent_started:pm',
      'text_delta:pm',
      'agent_done:pm',
      'agent_started:eng',
      'text_delta:eng',
      'agent_done:eng',
    ],
  );
});

test('run() executes write_file so the file actually lands in the sandbox', async () => {
  const sandbox = new FakeSandbox();
  const orchestrator = createOrchestrator({
    sandbox,
    model: new FakeModel({
      pm: planTurn(['a.txt']),
      eng: [
        [
          { type: 'tool_call_start', toolCallId: 't1', toolName: 'write_file' },
          { type: 'tool_input_delta', toolCallId: 't1', argsDelta: '{"path":"index.html",' },
          { type: 'tool_input_delta', toolCallId: 't1', argsDelta: '"content":"<h1>hi</h1>"}' },
          { type: 'tool_call_end', toolCallId: 't1' },
        ],
        [{ type: 'text', delta: 'done' }],
      ],
    }),
    credits: new FakeCredits(),
  });

  await collect(orchestrator.run('session-1', 'make a hello page'));

  // Scaffold files are laid down too (ticket 03); the model's file is what
  // this test is about.
  assert.ok(sandbox.allPaths().includes('index.html'));
  const sandboxId = [...sandbox.files.keys()][0]!;
  assert.equal(await sandbox.readFile(sandboxId, 'index.html'), '<h1>hi</h1>');
});

test('run() emits tool events around a write_file call', async () => {
  const orchestrator = createOrchestrator({
    sandbox: new FakeSandbox(),
    model: new FakeModel({
      pm: planTurn(['a.txt']),
      eng: [
        [
          { type: 'tool_call_start', toolCallId: 't1', toolName: 'write_file' },
          { type: 'tool_input_delta', toolCallId: 't1', argsDelta: '{"path":"a.txt","content":"x"}' },
          { type: 'tool_call_end', toolCallId: 't1' },
        ],
        [{ type: 'text', delta: 'done' }],
      ],
    }),
    credits: new FakeCredits(),
  });

  const events = await collect(orchestrator.run('session-1', 'go'));

  assert.deepEqual(
    events.map((event) => event.type),
    [
      // pm: narrate, call plan_files, close
      'agent_started',
      'text_delta',
      'tool_call_start',
      'tool_input_delta',
      'tool_result',
      'text_delta', // pm's closing step
      'agent_done',
      // plan lands between the two agents
      'plan_ready',
      // eng: write, close, pipeline
      'agent_started',
      'tool_call_start',
      'tool_input_delta',
      'tool_result',
      'text_delta',
      'run_step', // installing
      'run_step', // building
      'run_step', // starting
      'run_step', // preview_ready
      'agent_done',
    ],
  );
});

test('run() reuses one sandbox across turns in the same session', async () => {
  const sandbox = new FakeSandbox();
  const orchestrator = createOrchestrator({
    sandbox,
    model: new FakeModel({
      // eng writes nothing, so App.tsx never exists and both turns are
      // 'first turns' — two pm plans cover that honestly.
      pm: [...planTurn(['a.txt']), ...planTurn(['b.txt'])],
      eng: [[{ type: 'text', delta: 'one' }], [{ type: 'text', delta: 'two' }]],
    }),
    credits: new FakeCredits(),
  });

  await collect(orchestrator.run('session-1', 'first'));
  await collect(orchestrator.run('session-1', 'second'));

  assert.equal(sandbox.files.size, 1);
});

test('run() emits an error event when tool arguments are malformed', async () => {
  const orchestrator = createOrchestrator({
    sandbox: new FakeSandbox(),
    model: new FakeModel({
      pm: planTurn(['a.txt']),
      eng: [
        [
          { type: 'tool_call_start', toolCallId: 't1', toolName: 'write_file' },
          { type: 'tool_input_delta', toolCallId: 't1', argsDelta: '{"path": truncated' },
          { type: 'tool_call_end', toolCallId: 't1' },
        ],
        [{ type: 'text', delta: 'done' }],
      ],
    }),
    credits: new FakeCredits(),
  });

  const events = await collect(orchestrator.run('session-1', 'go'));

  assert.ok(events.some((event) => event.type === 'error'));
});

test('run() produces the same event sequence on repeated calls with the same script', async () => {
  function makeOrchestrator() {
    return createOrchestrator({
      sandbox: new FakeSandbox(),
      model: new FakeModel({
        pm: planTurn(['a.txt']),
        eng: [[{ type: 'text', delta: 'Hello.' }]],
      }),
      credits: new FakeCredits(),
    });
  }

  const run1 = (await collect(makeOrchestrator().run('s', 'x'))).map((e) => e.type);
  const run2 = (await collect(makeOrchestrator().run('s', 'x'))).map((e) => e.type);

  assert.deepEqual(run1, run2);
});

test('FakeSandbox write then read round-trips content', async () => {
  const sandbox = new FakeSandbox();
  const id = await sandbox.create('ws-1');
  await sandbox.writeFile(id, 'src/App.tsx', 'export default function App() {}');
  const content = await sandbox.readFile(id, 'src/App.tsx');
  assert.equal(content, 'export default function App() {}');
});

test('FakeSandbox failCommand causes runCommand to return non-zero exit code', async () => {
  const sandbox = new FakeSandbox();
  const id = await sandbox.create('ws-1');
  sandbox.failCommand(/build/, 'Build error: missing module', 1);

  const result = await sandbox.runCommand(id, 'npm run build');

  assert.equal(result.exitCode, 1);
  assert.ok(result.output.includes('Build error'));
});

test('FakeSandbox failCommand only fails the specified number of times', async () => {
  const sandbox = new FakeSandbox();
  const id = await sandbox.create('ws-1');
  sandbox.failCommand(/build/, 'error', 2);

  const r1 = await sandbox.runCommand(id, 'npm run build');
  const r2 = await sandbox.runCommand(id, 'npm run build');
  const r3 = await sandbox.runCommand(id, 'npm run build');

  assert.equal(r1.exitCode, 1);
  assert.equal(r2.exitCode, 1);
  assert.equal(r3.exitCode, 0); // recovers after 2 failures
});

test('FakeCredits records reservation and settlement', async () => {
  const credits = new FakeCredits();

  const reserved = await credits.reserve('session-1', 1000);
  await credits.settle('session-1', 750);

  assert.ok(reserved.ok);
  assert.equal(credits.reservations.length, 1);
  assert.equal(credits.reservations[0]?.sessionId, 'session-1');
  assert.equal(credits.settlements[0]?.actualTokens, 750);
});

test('FakeCredits returns ok: false when configured to fail reservation', async () => {
  const credits = new FakeCredits({ reserveSucceeds: false });
  const result = await credits.reserve('session-1', 1000);
  assert.equal(result.ok, false);
});

test('FakeModel throws when no scripted turn remains', async () => {
  const model = new FakeModel({ lead: [] });
  await assert.rejects(
    async () => {
      for await (const _ of model.stream('lead', [])) { /* drain */ }
    },
    /no scripted turn left/,
  );
});
