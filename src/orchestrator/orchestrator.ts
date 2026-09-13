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
import { injectRlsTemplate } from '../backend/rls-template.ts';

/**
 * The security gate (RLS template + Security Advisor scan in production).
 * Injected: the real implementation arrives with forge-app-backend; the
 * state machine edge and its presentation are core-loop concerns.
 *
 * A gate failure is TERMINAL for the run — it must never feed the
 * bounded self-repair loop (a technical build failure is fixable; an
 * unsafe data-isolation policy is not something to retry past).
 */
/** Context the gate inspects: which sandbox, whose workspace, what SQL. */
export interface GateContext {
  sandboxId: string;
  workspaceId: string;
  /** Present when the project carries supabase/migrations — already INJECTED. */
  migrationSql?: string;
}

export interface GatePort {
  check(
    ctx: GateContext,
  ): Promise<{ ok: true } | { ok: false; code: string; detail: string }>;
}

export interface OrchestratorDeps {
  sandbox: SandboxPort;
  model: ModelPort;
  credits: CreditsPort;
  gate?: GatePort;
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
  run(
    sessionId: string,
    userInput: string,
    opts?: { signal?: AbortSignal },
  ): AsyncIterable<StreamEvent>;
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
   * Sessions whose last turn was interrupted. The next run prepends a
   * "you were interrupted here" line so the model continues instead of
   * repeating finished work.
   */
  const interruptedSessions = new Set<string>();

  /**
   * Sessions whose last run failed the gate, with the finding. The next
   * run prepends the finding to Alex's prompt ('让 Alex 重写').
   */
  const gateFailedSessions = new Map<string, { code: string; detail: string }>();

  /**
   * Every path ever written per session. Turn 2+ builds a current-code
   * manifest from these (read live from the sandbox) — the model sees what
   * exists NOW, which beats replaying conversation history: bounded, always
   * fresh, and immune to the destructive-rewrite failure (ticket 03 finding).
   */
  const sessionPaths = new Map<string, Set<string>>();

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
    sessionId: string,
    sandboxId: string,
    pathsWritten: Set<string>,
    needsInstall = true,
  ): AsyncGenerator<StreamEvent> {
    try {
      // Round 2+ without dependency changes skips install: node_modules
      // survives in the sandbox's filesystem, and a no-op install still
      // costs tens of seconds (the prototype's iterate variant found this).
      if (needsInstall) {
        yield { type: 'run_step', step: 'installing' };
        await runCommandOrFail(sandboxId, 'npm install --no-audit --no-fund', 'npm install');
      }

      // Migrating + security gate (state machine: installing → migrating →
      // gating → building). Migration SQL is INJECTED with the platform
      // template before the gate ever sees it — the model cannot opt out.
      // Absent gate = pass through. A FAILED gate is terminal: rollback
      // semantics belong to the gate itself; here we stop, surface the
      // finding, and remember it for the rewrite turn.
      // Build-time env for persistent apps: publishable values only — the
      // secret key NEVER enters the sandbox (migrations run server-side).
      const appsUrl = process.env['APPS_SUPABASE_URL'];
      if (appsUrl) {
        await deps.sandbox.writeFile(
          sandboxId,
          '.env',
          [
            `VITE_SUPABASE_URL=${appsUrl}`,
            `VITE_SUPABASE_PUBLISHABLE_KEY=${process.env['APPS_SUPABASE_PUBLISHABLE_KEY'] ?? ''}`,
            `VITE_WORKSPACE_ID=${sessionId}`,
          ].join('\n'),
        );
      }

      let migrationSql: string | undefined;
      try {
        const migrationFiles = (await deps.sandbox.listFiles(sandboxId, 'supabase/migrations'))
          .filter((p) => p.endsWith('.sql'))
          .sort();
        if (migrationFiles.length > 0) {
          yield { type: 'run_step', step: 'migrating' };
          const raw = await Promise.all(
            migrationFiles.map((p) => deps.sandbox.readFile(sandboxId, p)),
          );
          migrationSql = injectRlsTemplate(raw.join('\n\n'), sessionId).sql;
        }
      } catch {
        // no migrations directory — nothing to gate on
      }
      if (deps.gate) {
        yield { type: 'gate_started', gate: 'security' };
        const verdict = await deps.gate.check({
          sandboxId,
          workspaceId: sessionId,
          ...(migrationSql !== undefined ? { migrationSql } : {}),
        });
        if (!verdict.ok) {
          gateFailedSessions.set(sessionId, { code: verdict.code, detail: verdict.detail });
          yield { type: 'gate_failed', code: verdict.code, detail: verdict.detail };
          return;
        }
      }

      // Bounded self-repair: a build failure is a technical problem, so the
      // orchestrator feeds the raw error back to Alex and rebuilds. The
      // promise is at most THREE REPAIR ROUNDS (so four builds in total) —
      // what the user sees ("自己修（第 N 次）") is the contract. Exhausting
      // the rounds is terminal (gave_up) with a next-step suggestion, never
      // an infinite spinner. Contrast gate failures (ticket 11): those never
      // auto-retry.
      const MAX_REPAIR_ROUNDS = 3;
      let buildError: string | null = null;
      let gaveUp = false;
      for (let round = 1; round <= MAX_REPAIR_ROUNDS + 1; round += 1) {
        yield { type: 'run_step', step: 'building' };
        try {
          await runCommandOrFail(sandboxId, 'npm run build', 'build');
          buildError = null;
          break;
        } catch (error) {
          buildError = error instanceof Error ? error.message : String(error);

          if (round > MAX_REPAIR_ROUNDS) {
            gaveUp = true;
            break;
          }

          yield {
            type: 'run_step',
            step: 'autofixing',
            attempt: round,
            error: buildError,
          };
          yield {
            type: 'agent_started',
            agentHandle: 'eng',
            messageId: `msg-${++messageCounter}`,
          };
          const fix = yield* runAgentSteps(
            'eng',
            [
              {
                role: 'user',
                content: [
                  'npm run build failed with this output:',
                  '',
                  buildError,
                  '',
                  'Fix the code so the build passes.',
                  "Reply rules: your FIRST sentence must be one short plain-language line (in the user's language, 中文 if they wrote Chinese) saying what went wrong — the user reads it while you work. Then fix it with write_file: write ONLY the files that need changes. The project scaffold must not be modified.",
                  pathsWritten.size > 0
                    ? `Files in the project: ${[...pathsWritten].join(', ')}`
                    : '',
                ]
                  .filter((line) => line !== '')
                  .join('\n'),
              },
            ],
            sandboxId,
          );
          yield { type: 'agent_done', agentHandle: 'eng', creditsUsed: 0 };
          for (const path of fix.paths) pathsWritten.add(path);

          if (fix.filesWritten === 0) {
            // A repair round that changed nothing cannot fix the build —
            // rebuilding identical code is pure waste. Give up now.
            gaveUp = true;
            break;
          }
        }
      }
      if (gaveUp && buildError !== null) {
        yield {
          type: 'error',
          agentHandle: 'eng',
          message:
            `构建失败，Alex 已尝试自动修复但未能通过。已写入的文件都保留了。` +
            `下一步建议：换一个更简单的描述重新生成，或换个说法再试一次。`,
        };
        return;
      }

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
    signal?: AbortSignal,
  ): AsyncGenerator<
    StreamEvent,
    { filesWritten: number; plan: Plan | null; paths: string[]; tokens: number }
  > {
    const MAX_STEPS = 10;
    let plan: Plan | null = null;
    let filesWritten = 0;
    let tokens = 0;
    const paths: string[] = [];
    // Tool arguments arrive as fragments. Buffer them per call id until the
    // model signals the call is complete, then parse and execute once.
    const openCalls = new Map<string, { toolName: string; args: string }>();

    for (let step = 0; step < MAX_STEPS; step += 1) {
      const stepCalls: ToolCallPart[] = [];
      const stepResults: ToolResultPart[] = [];

      for await (const chunk of deps.model.stream(agentHandle, conversation, signal ? { signal } : {})) {
        if (signal?.aborted) break;
        switch (chunk.type) {
          case 'text': {
            yield { type: 'text_delta', agentHandle, delta: chunk.delta };
            break;
          }

          case 'usage': {
            tokens += chunk.input + chunk.output;
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
                paths.push((result as { path: string }).path);
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

    return { filesWritten, plan, paths, tokens };
  }

  const api = {
    async *run(
      sessionId: string,
      userInput: string,
      opts?: { signal?: AbortSignal },
    ): AsyncIterable<StreamEvent> {
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
        yield* api.runSerialized(sessionId, userInput, opts);
      } finally {
        release();
      }
    },

    async *runSerialized(
      sessionId: string,
      userInput: string,
      opts?: { signal?: AbortSignal },
    ): AsyncIterable<StreamEvent> {
      let tokensUsed = 0;
      // Reserve BEFORE anything exists: a blocked run must not create a
      // sandbox, run a model call, or touch the filesystem. blocked_credits
      // in the state machine is a pre-flight gate, not a failure.
      // The estimate is deliberately conservative (wayfinder: "you don't know
      // what a request costs until it finishes") — settle trues it down.
      const ESTIMATE_TOKENS = Number(process.env['RESERVE_ESTIMATE_TOKENS'] ?? '3000');
      const reservation = await deps.credits.reserve(sessionId, ESTIMATE_TOKENS);
      if (!reservation.ok) {
        yield { type: 'blocked_credits', ...(reservation.resetsAt ? { resetsAt: reservation.resetsAt } : {}) };
        return;
      }

      const sandboxId = await sandboxFor(sessionId);
      // Written this turn — feeds the fix turns so Alex knows the project.
      const pathsWritten = new Set<string>();
      await ensureScaffold(sandboxId);
      const isFirstTurn = !(await appExists(sessionId, sandboxId));
      if (isFirstTurn) plannedSessions.add(sessionId);

      // ── First turn: Emma plans, then Alex builds from her plan. ────────
      // The plan drives skeleton-first: the tree appears as placeholders the
      // moment Emma's list lands, giving the wait a shape before any code.
      // On iterate turns (the app exists) planning is skipped entirely —
      // modification scope is small and the preview is already visible.
      let engPrompt = userInput;
      const knownPaths = sessionPaths.get(sessionId);
      if (!isFirstTurn && knownPaths && knownPaths.size > 0) {
        // Iterate turn: the model gets the CURRENT code, not a history
        // replay — it can only rewrite what it can see, and it can see
        // everything that exists.
        const manifest: string[] = [];
        for (const path of [...knownPaths].sort()) {
          try {
            manifest.push(`--- ${path} ---\n${await deps.sandbox.readFile(sandboxId, path)}`);
          } catch {
            manifest.push(`--- ${path} --- (unreadable)`);
          }
        }
        engPrompt = [
          'The project currently contains these files:',
          '',
          manifest.join('\n\n'),
          '',
          `User request (modify what is needed, leave everything else EXACTLY as is): ${userInput}`,
        ].join('\n');
      }
      if (interruptedSessions.has(sessionId)) {
        interruptedSessions.delete(sessionId);
        engPrompt = `（上一轮在此处被中断，已写入的文件都在。）\n\n${userInput}`;
        userInput = engPrompt;
      }
      const gateFinding = gateFailedSessions.get(sessionId);
      if (gateFinding) {
        gateFailedSessions.delete(sessionId);
        engPrompt = [
          `上一轮的安全检查未通过，已回滚：${gateFinding.code} — ${gateFinding.detail}`,
          '重写这部分，使数据访问策略安全。不要动其他文件。',
          '',
          engPrompt,
        ].join('\n');
      }
      if (isFirstTurn) {
        yield { type: 'agent_started', agentHandle: 'pm', messageId: `msg-${++messageCounter}` };
        const pmResult = yield* runAgentSteps(
          'pm',
          [{ role: 'user', content: userInput }],
          sandboxId,
          opts?.signal,
        );
        tokensUsed += pmResult.tokens;
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
      let aborted = opts?.signal?.aborted === true;
      let engResult: {
        filesWritten: number;
        plan: Plan | null;
        paths: string[];
        tokens: number;
      } = { filesWritten: 0, plan: null, paths: [], tokens: 0 };
      if (!aborted) {
        yield { type: 'agent_started', agentHandle: 'eng', messageId: `msg-${++messageCounter}` };
        engResult = yield* runAgentSteps(
          'eng',
          [{ role: 'user', content: engPrompt }],
          sandboxId,
          opts?.signal,
        );
        tokensUsed += engResult.tokens;
        aborted = opts?.signal?.aborted === true;
      }

      if (aborted) {
        // The user stopped mid-generation. Everything written so far stays;
        // the pipeline is skipped (an incomplete app has no preview to
        // serve); credits settle on actual usage; the session is marked so
        // the next turn knows where it stopped.
        interruptedSessions.add(sessionId);
        yield { type: 'interrupted', reason: 'user' };
        await deps.credits.settle(sessionId, 0);
        // Pause: files are kept, but a stopped run must not keep burning
        // paid runtime until the E2B timeout.
        await deps.sandbox.pause(sandboxId);
        yield { type: 'agent_done', agentHandle: 'eng', creditsUsed: 0 };
        return;
      }

      if (engResult.filesWritten > 0) {
        for (const path of engResult.paths) pathsWritten.add(path);
        try {
          const needsInstall =
            isFirstTurn || pathsWritten.has('package.json');
          for await (const stepEvent of runPipeline(sessionId, sandboxId, pathsWritten, needsInstall)) {
            if (opts?.signal?.aborted) break;
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

      await deps.credits.settle(sessionId, tokensUsed);

      // Merge everything this turn wrote (including fix rounds) into the
      // session manifest for the next iterate turn.
      if (pathsWritten.size > 0) {
        const sessionSet = sessionPaths.get(sessionId) ?? new Set<string>();
        for (const path of pathsWritten) sessionSet.add(path);
        sessionPaths.set(sessionId, sessionSet);
      }

      yield { type: 'agent_done', agentHandle: 'eng', creditsUsed: tokensUsed };
    },
  };

  return api;
}
