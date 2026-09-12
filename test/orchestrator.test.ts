import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createOrchestrator } from '../src/orchestrator/orchestrator.ts';
import { FakeSandbox } from './fakes/fake-sandbox.ts';
import { FakeModel } from './fakes/fake-model.ts';
import { FakeCredits } from './fakes/fake-credits.ts';
import type { ForgeEvent } from '../src/domain/events.ts';

async function collect(stream: AsyncIterable<ForgeEvent>): Promise<ForgeEvent[]> {
  const out: ForgeEvent[] = [];
  for await (const event of stream) out.push(event);
  return out;
}

test('run() streams agent_started then text_delta then agent_done', async () => {
  const orchestrator = createOrchestrator({
    sandbox: new FakeSandbox(),
    model: new FakeModel({ lead: [[{ type: 'text', delta: 'Got it.' }]] }),
    credits: new FakeCredits(),
  });

  const events = await collect(orchestrator.run('session-1', 'make a hello page'));

  assert.deepEqual(
    events.map((event) => event.type),
    ['agent_started', 'text_delta', 'agent_done'],
  );
});

test('run() produces the same event sequence on repeated calls with the same script', async () => {
  function makeOrchestrator() {
    return createOrchestrator({
      sandbox: new FakeSandbox(),
      model: new FakeModel({ lead: [[{ type: 'text', delta: 'Hello.' }]] }),
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
