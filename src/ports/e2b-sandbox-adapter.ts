import { Sandbox } from 'e2b';
import type { SandboxPort } from './sandbox-port.ts';

/** The pieces of the SDK's CommandResult we read when a command fails. */
interface CommandResultLike {
  exitCode?: number;
  error?: string;
  stdout?: string;
  stderr?: string;
}

/** On failure the useful text can be in any of three places; join what exists. */
function joinOutput(result: CommandResultLike): string {
  return [result.error, result.stderr, result.stdout]
    .filter((part) => part !== undefined && part !== '')
    .join('\n');
}

/**
 * Real E2B adapter.
 *
 * All E2B SDK calls are isolated here. Orchestrator sees only `SandboxPort`.
 *
 * Constraints from CONTEXT.md and ticket research:
 * - Every sandbox must be created with `metadata: { workspace_id }` so
 *   `Sandbox.list()` can locate it for GC.
 * - `onTimeout: 'pause'` prevents a timed-out session from being destroyed;
 *   E2B auto-resumes on the next arriving request.
 * - `Sandbox.connect()` only extends lifetime, never shortens it. Use
 *   `setTimeout()` for an exact reset.
 * - The SDK must be the latest version (issue #875: older `connect()` calls
 *   overwrite `autoPause`, killing the sandbox).
 */
export class E2BSandboxAdapter implements SandboxPort {
  readonly #apiKey: string;

  constructor(apiKey: string) {
    this.#apiKey = apiKey;
  }

  async create(workspaceId: string): Promise<string> {
    const sandbox = await Sandbox.create({
      apiKey: this.#apiKey,
      metadata: { workspace_id: workspaceId },
      lifecycle: { onTimeout: 'pause', autoResume: true },
    });
    return sandbox.sandboxId;
  }

  async writeFile(sandboxId: string, path: string, content: string): Promise<void> {
    const sandbox = await this.#connect(sandboxId);
    await sandbox.files.write(path, content);
  }

  async findSandbox(workspaceId: string): Promise<string | null> {
    const paginator = Sandbox.list({
      apiKey: this.#apiKey,
      query: { metadata: { workspace_id: workspaceId } },
    });
    let page = await paginator.nextItems();
    const all = [...page];
    while (paginator.hasNext) {
      page = await paginator.nextItems();
      all.push(...page);
    }
    return all.length > 0 ? all[0]!.sandboxId : null;
  }

  async listFiles(sandboxId: string, dir: string): Promise<string[]> {
    const sandbox = await this.#connect(sandboxId);
    const entries = await sandbox.files.list(dir);
    const out: string[] = [];
    for (const entry of entries) {
      if (entry.type === 'dir') {
        // Dot-dirs (.npm cache with thousands of entries, .git, .cache) and
        // build output never belong in a walk — descending into .npm from
        // the root effectively hangs (one files.list per cache directory).
        // Mirrors the export route's EXCLUDED_DIRS semantics.
        if (
          entry.name === 'node_modules' ||
          entry.name === 'dist' ||
          entry.name.startsWith('.')
        )
          continue;
        const nested = await this.listFiles(sandboxId, `${dir}/${entry.name}`.replace('//', '/'));
        out.push(...nested);
      } else {
        out.push(`${dir}/${entry.name}`.replace('//', '/'));
      }
    }
    return out;
  }

  async readFile(sandboxId: string, path: string): Promise<string> {
    const sandbox = await this.#connect(sandboxId);
    // The default overload returns text; naming the format keeps that true
    // even if the SDK's default ever changes.
    return await sandbox.files.read(path, { format: 'text' });
  }

  async runCommand(
    sandboxId: string,
    cmd: string,
    opts?: { timeoutMs?: number },
  ): Promise<{ exitCode: number; output: string }> {
    const sandbox = await this.#connect(sandboxId);
    try {
      const result = await sandbox.commands.run(cmd, {
        ...(opts?.timeoutMs !== undefined ? { timeoutMs: opts.timeoutMs } : {}),
      });
      if (!('exitCode' in result)) {
        return { exitCode: 0, output: '' };
      }
      return {
        exitCode: result.exitCode,
        output: result.exitCode === 0 ? result.stdout : joinOutput(result),
      };
    } catch (err) {
      // The SDK throws CommandExitError on non-zero exit instead of returning
      // the result. The real output — npm/tsc diagnostics — is on `.result`.
      const result = (err as { result?: CommandResultLike }).result;
      if (result) {
        return {
          exitCode: result.exitCode ?? 1,
          output: joinOutput(result),
        };
      }
      throw err;
    }
  }

  async runBackground(sandboxId: string, cmd: string): Promise<string> {
    const sandbox = await this.#connect(sandboxId);
    // A background process survives pause when the memory snapshot is kept:
    // auto-resume brings the dev server back with the sandbox.
    const process = await sandbox.commands.run(cmd, { background: true });
    return String(process.pid);
  }

  async getPreviewHost(sandboxId: string, port: number): Promise<string> {
    const sandbox = await this.#connect(sandboxId);
    return sandbox.getHost(port);
  }

  async pause(sandboxId: string): Promise<void> {
    const sandbox = await this.#connect(sandboxId);
    await sandbox.pause();
  }

  async resume(sandboxId: string): Promise<string> {
    // E2B auto-resumes on connect; this explicit call lets the orchestrator
    // confirm the sandbox is running before surfacing a preview URL.
    const sandbox = await this.#connect(sandboxId);
    return sandbox.sandboxId;
  }

  async kill(sandboxId: string): Promise<void> {
    await Sandbox.kill(sandboxId, { apiKey: this.#apiKey });
  }

  /**
   * Connecting is how every operation other than create/kill begins, and
   * `connect()` is also what extends a sandbox's lifetime. Keeping it in one
   * place means the lifetime semantics are stated once.
   */
  async #connect(sandboxId: string) {
    return await Sandbox.connect(sandboxId, { apiKey: this.#apiKey });
  }
}
