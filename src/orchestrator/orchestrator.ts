import type { AgentHandle } from '../domain/roles.ts';
import type { ForgeEvent, StreamEvent } from '../domain/events.ts';
import type { CreditsPort } from '../ports/credits-port.ts';
import type {
  ModelMessage,
  ModelPort,
  StepMessage,
  ToolCallPart,
  ToolResultPart,
} from '../ports/model-port.ts';
import type { SandboxPort } from '../ports/sandbox-port.ts';
import { SCAFFOLD_FILES } from './scaffold.ts';

export interface OrchestratorDeps {
  sandbox: SandboxPort;
  model: ModelPort;
  credits: CreditsPort;
}

export interface Orchestrator {
  /**
   * Run one generation turn for a session and stream what happens.
   *
   * This is the single seam the whole generation loop is tested at. It knows
   * nothing about HTTP and nothing about React — everything from role dispatch
   * to skeleton-first timing to bounded self-repair lives behind this call.
   *
   * The stream carries both durable events and transient progress: `StreamEvent`
   * is the union. Only the `ForgeEvent` half is persisted.
   */
  run(sessionId: string, userInput: string): AsyncIterable<StreamEvent>;
}

/** What `write_file` expects once its streamed argument JSON is complete. */
interface WriteFileArgs {
  path: string;
  content: string;
}

/**
 * Validate the model's streamed tool arguments before touching the sandbox.
 *
 * Schema validation at the boundary is the reason native tool calls were chosen
 * over an XML protocol: a malformed or truncated payload fails here, loudly,
 * instead of silently writing a half-file.
 */
function parseWriteFileArgs(raw: string): WriteFileArgs {
  const parsed: unknown = JSON.parse(raw);
  const candidate = parsed as { path?: unknown; content?: unknown };

  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    typeof candidate.path !== 'string' ||
    typeof candidate.content !== 'string'
  ) {
    throw new Error('write_file expects { path: string, content: string }');
  }
  return { path: candidate.path, content: candidate.content };
}

export function createOrchestrator(deps: OrchestratorDeps): Orchestrator {
  let messageCounter = 0;

  /**
   * One sandbox per session, reused across turns.
   *
   * Waking a paused sandbox is the real adapter's job — E2B resumes on the
   * arriving request — so the orchestrator only has to remember which sandbox
   * belongs to which session.
   */
  const sandboxBySession = new Map<string, string>();

  /**
   * Sessions that already planned once, in this process. Guards against a
   * transient sandbox error mid-iterate misreading "cannot read" as "no app"
   * and re-planning over a finished tree. App.tsx existence remains the
   * persistent signal across process restarts; this set is the fast, robust
   * one within a process.
   */
  const plannedSessions = new Set<string>();

  /**
   * Single writer per session (spec: 工作区写入是单写者). Concurrent run()s —
   * double submit, second tab, direct API — queue behind each other instead
   * of racing appExists and double-writing the sandbox.
   */
  const runQueue = new Map<string, Promise<unknown>>();

  async function sandboxFor(sessionId: string): Promise<string> {
    const existing = sandboxBySession.get(sessionId);
    if (existing !== undefined) return existing;

    // Session and workspace are 1:1 in the MVP, so the session id doubles as
    // the workspace id the sandbox is tagged with.
    const created = await deps.sandbox.create(sessionId);
    sandboxBySession.set(sessionId, created);
    return created;
  }

  /**
   * Lay down the deterministic scaffold once per session.
   *
   * Boilerplate has no decisions in it, so the orchestrator writes it instead
   * of the model — a generation turn that runs out of output tokens can no
   * longer produce an unbuildable project by skipping package.json.
   */
  async function ensureScaffold(sandboxId: string): Promise<void> {
    try {
      await deps.sandbox.readFile(sandboxId, 'package.json');
      return; // already scaffolded
    } catch {
      // NOTE: this catch also swallows transient sandbox errors (a resume
      // 503 reads the same as "no such file"), which would re-lay the
      // scaffold. Accepted for the MVP: the prompt forbids the model from
      // customizing scaffold files, so a re-lay is idempotent in practice.
    }
    for (const [path, content] of Object.entries(SCAFFOLD_FILES)) {
      await deps.sandbox.writeFile(sandboxId, path, content);
    }
  }

  async function executeTool(
    toolName: string,
    rawArgs: string,
    sandboxId: string,
  ): Promise<unknown> {
    if (toolName !== 'write_file') {
      throw new Error(`unknown tool: ${toolName}`);
    }
    const { path, content } = parseWriteFileArgs(rawArgs);
    await deps.sandbox.writeFile(sandboxId, path, content);
    return { ok: true, path, bytes: content.length };
  }

/** Emma's plan: the file list that drives skeleton-first. */
interface Plan {
  files: string[];
  description: string;
}

function parsePlanArgs(raw: string): Plan {
  const parsed = JSON.parse(raw) as { files?: unknown; description?: unknown };
  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    !Array.isArray(parsed.files) ||
    parsed.files.length === 0 ||
    !parsed.files.every((f) => typeof f === 'string') ||
    typeof parsed.description !== 'string'
  ) {
    throw new Error(
      'plan_files expects { files: string[] (non-empty), description: string }',
    );
  }
  return { files: parsed.files as string[], description: parsed.description };
}

/**
 * First turn = no app in the sandbox yet. src/App.tsx is the scaffold's one
 * required model-written file, so its absence is the reliable signal — and it
 * survives process restarts, unlike an in-memory flag.
 */
  /**
   * First turn = no app in the sandbox yet. src/App.tsx is the scaffold's one
   * required model-written file, so its absence is the reliable signal — and
   * it survives process restarts, unlike an in-memory flag.
   */
  async function appExists(sessionId: string, sandboxId: string): Promise<boolean> {
    if (plannedSessions.has(sessionId)) return true;
    try {
      await deps.sandbox.readFile(sandboxId, 'src/App.tsx');
      return true;
    } catch {
      return false;
    }
  }

  /** Install and build can each take a minute on a cold cache. */
  const SLOW_COMMAND_MS = 300_000;

  /** How long to wait for the dev server to answer before giving up. */
  const DEV_SERVER_READY_ATTEMPTS = 15;

  async function runCommandOrFail(
    sandboxId: string,
    cmd: string,
    label: string,
  ): Promise<void> {
    const { exitCode, output } = await deps.sandbox.runCommand(sandboxId, cmd, {
      timeoutMs: SLOW_COMMAND_MS,
    });
    if (exitCode !== 0) {
      throw new Error(`${label} failed: ${output.slice(0, 500)}`);
    }
  }

  /**
   * The post-generation pipeline: install → build → dev server → preview.
   *
   * Runs only when the turn actually wrote files. Each step emits a transient
   * `run_step` so the gap between the last file write and a usable preview is
   * visible instead of a black hole. A failed step aborts the pipeline — no
   * preview of an app that did not build — but the sandbox is still paused in
   * the finally: a failed run must not keep burning paid runtime until the
   * E2B timeout. Auto-resume (enabled at create) wakes it on the next request,
   * and the memory snapshot keeps the dev server alive across the pause.
   */
  async function* runPipeline(
    sandboxId: string,
  ): AsyncGenerator<StreamEvent> {
    try {
      yield { type: 'run_step', step: 'installing' };
      await runCommandOrFail(sandboxId, 'npm install --no-audit --no-fund', 'npm install');

      yield { type: 'run_step', step: 'building' };
      await runCommandOrFail(sandboxId, 'npm run build', 'build');

      yield { type: 'run_step', step: 'starting' };
      await deps.sandbox.runBackground(
        sandboxId,
        'npm run dev -- --host 0.0.0.0 --port 3000 --strictPort',
      );

      // Wait for the dev server to actually answer before pointing the
      // preview at it — an iframe that loads during boot shows a blank frame,
      // and falling through silently would emit preview_ready for a dead one.
      let serverReady = false;
      for (let attempt = 0; attempt < DEV_SERVER_READY_ATTEMPTS; attempt += 1) {
        const probe = await deps.sandbox
          .runCommand(
            sandboxId,
            'curl -s -o /dev/null -w %{http_code} http://127.0.0.1:3000',
            { timeoutMs: 5_000 },
          )
          .catch(() => ({ exitCode: 1, output: '' }));
        if (probe.exitCode === 0 && probe.output.trim() === '200') {
          serverReady = true;
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
      if (!serverReady) {
        throw new Error(
          `dev server did not answer on port 3000 within ${DEV_SERVER_READY_ATTEMPTS} attempts`,
        );
      }

      const host = await deps.sandbox.getPreviewHost(sandboxId, 3000);
      yield { type: 'run_step', step: 'preview_ready', url: `https://${host}` };
    } finally {
      await deps.sandbox.pause(sandboxId);
    }
  }

  /**
   * The generation loop for one agent. Models emit a batch of tool calls and
   * stop, expecting the results before continuing — a single stream call
   * yields one step, not an app. So: run a step, execute its tools, feed the
   * calls and results back as messages, repeat until a step produces no tool
   * calls. Bounded so a confused model cannot loop forever.
   *
   * The caller owns agent_started/agent_done and the pipeline; this owns the
   * steps between them. Returns what the agent accomplished so the caller can
   * dispatch on it (a captured plan, files written).
   */
  async function* runAgentSteps(
    agentHandle: AgentHandle,
    conversation: (ModelMessage | StepMessage)[],
    sandboxId: string,
  ): AsyncGenerator<StreamEvent, { filesWritten: number; plan: Plan | null }> {
    const MAX_STEPS = 10;
    let plan: Plan | null = null;
    let filesWritten = 0;
    // Tool arguments arrive as fragments. Buffer them per call id until the
    // model signals the call is complete, then parse and execute once.
    const openCalls = new Map<string, { toolName: string; args: string }>();

    for (let step = 0; step < MAX_STEPS; step += 1) {
      const stepCalls: ToolCallPart[] = [];
      const stepResults: ToolResultPart[] = [];

      for await (const chunk of deps.model.stream(agentHandle, conversation)) {
        switch (chunk.type) {
          case 'text': {
            yield { type: 'text_delta', agentHandle, delta: chunk.delta };
            break;
          }

          case 'tool_call_start': {
            openCalls.set(chunk.toolCallId, { toolName: chunk.toolName, args: '' });
            yield {
              type: 'tool_call_start',
              agentHandle,
              toolCallId: chunk.toolCallId,
              toolName: chunk.toolName,
            };
            break;
          }

          case 'tool_input_delta': {
            const call = openCalls.get(chunk.toolCallId);
            if (call) call.args += chunk.argsDelta;
            yield {
              type: 'tool_input_delta',
              agentHandle,
              toolCallId: chunk.toolCallId,
              argsDelta: chunk.argsDelta,
            };
            break;
          }

          case 'tool_call_end': {
            const call = openCalls.get(chunk.toolCallId);
            openCalls.delete(chunk.toolCallId);
            if (!call) break;

            try {
              const isPlan = call.toolName === 'plan_files';
              let result: unknown;
              if (isPlan) {
                plan = parsePlanArgs(call.args);
                result = { ok: true, files: plan.files.length };
              } else if (agentHandle !== 'eng') {
                // Only Alex writes. A hallucinated write_file from another
                // role is refused rather than executed.
                throw new Error(`agent "${agentHandle}" may not call ${call.toolName}`);
              } else {
                result = await executeTool(call.toolName, call.args, sandboxId);
                filesWritten += 1;
              }

              yield {
                type: 'tool_result',
                agentHandle,
                toolCallId: chunk.toolCallId,
                result,
              };
              stepCalls.push({
                type: 'tool-call',
                toolCallId: chunk.toolCallId,
                toolName: call.toolName,
                input: JSON.parse(call.args) as unknown,
              });
              stepResults.push({
                type: 'tool-result',
                toolCallId: chunk.toolCallId,
                toolName: call.toolName,
                output: { type: 'text', value: JSON.stringify(result) },
              });
            } catch (error) {
              yield {
                type: 'error',
                agentHandle,
                message: error instanceof Error ? error.message : String(error),
              };
            }
            break;
          }
        }
      }

      if (stepCalls.length === 0) break; // model finished the turn

      conversation.push({ role: 'assistant', content: stepCalls });
      conversation.push({ role: 'tool', content: stepResults });

      if (step === MAX_STEPS - 1 && stepCalls.length > 0) {
        yield {
          type: 'error',
          agentHandle,
          message: `generation stopped at the ${MAX_STEPS}-step limit; the app may be incomplete`,
        };
      }
    }

    return { filesWritten, plan };
  }

  const api = {
    async *run(sessionId: string, userInput: string): AsyncIterable<StreamEvent> {
      // Serialize per session: the previous run's tail (pipeline, pause)
      // completes before this one starts, keeping one writer on the sandbox.
      // Entries are never deleted — each holds one resolved promise per
      // session, which is negligible for this deployment's session counts.
      const previous = runQueue.get(sessionId) ?? Promise.resolve();
      let release!: () => void;
      const done = new Promise<void>((resolve) => {
        release = resolve;
      });
      runQueue.set(sessionId, previous.then(() => done));
      await previous;

      try {
        yield* api.runSerialized(sessionId, userInput);
      } finally {
        release();
      }
    },

    async *runSerialized(sessionId: string, userInput: string): AsyncIterable<StreamEvent> {
      const sandboxId = await sandboxFor(sessionId);
      await ensureScaffold(sandboxId);
      const isFirstTurn = !(await appExists(sessionId, sandboxId));
      if (isFirstTurn) plannedSessions.add(sessionId);

      // ── First turn: Emma plans, then Alex builds from her plan. ────────
      // The plan drives skeleton-first: the tree appears as placeholders the
      // moment Emma's list lands, giving the wait a shape before any code.
      // On iterate turns (the app exists) planning is skipped entirely —
      // modification scope is small and the preview is already visible.
      let engPrompt = userInput;
      if (isFirstTurn) {
        yield { type: 'agent_started', agentHandle: 'pm', messageId: `msg-${++messageCounter}` };
        const pmResult = yield* runAgentSteps(
          'pm',
          [{ role: 'user', content: userInput }],
          sandboxId,
        );
        yield { type: 'agent_done', agentHandle: 'pm', creditsUsed: 0 };

        if (pmResult.plan) {
          yield { type: 'plan_ready', files: pmResult.plan.files };
          engPrompt = [
            `User request: ${userInput}`,
            '',
            `Emma's plan — description: ${pmResult.plan.description}`,
            'Files to write (write EVERY one):',
            ...pmResult.plan.files.map((f) => `- ${f}`),
          ].join('\n');
        }
      }

      // ── Alex builds. ──────────────────────────────────────────────────
      yield { type: 'agent_started', agentHandle: 'eng', messageId: `msg-${++messageCounter}` };
      const engResult = yield* runAgentSteps(
        'eng',
        [{ role: 'user', content: engPrompt }],
        sandboxId,
      );

      if (engResult.filesWritten > 0) {
        try {
          for await (const stepEvent of runPipeline(sandboxId)) {
            yield stepEvent;
          }
        } catch (error) {
          yield {
            type: 'error',
            agentHandle: 'eng',
            message: error instanceof Error ? error.message : String(error),
          };
        }
      }

      yield { type: 'agent_done', agentHandle: 'eng', creditsUsed: 0 };
    },
  };

  return api;
}
