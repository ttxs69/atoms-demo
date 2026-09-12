import type { SandboxPort } from '../../src/ports/sandbox-port.ts';

/**
 * A sandbox that holds a real in-memory filesystem.
 *
 * `writeFile` genuinely writes, so tests assert on what actually landed rather
 * than on which calls were made. That is what makes "files survive an
 * interrupt" (ticket 06) and "files survive self-repair" (ticket 05) real
 * assertions instead of mock bookkeeping.
 *
 * Commands can be made to fail on demand, which is how ticket 05 drives the
 * bounded self-repair loop.
 */
export class FakeSandbox implements SandboxPort {
  /** sandboxId -> (path -> content) */
  readonly files = new Map<string, Map<string, string>>();
  readonly commands: { sandboxId: string; cmd: string }[] = [];
  readonly background: { sandboxId: string; cmd: string }[] = [];
  readonly killed = new Set<string>();
  readonly paused = new Set<string>();

  #nextId = 1;
  #failures: { match: RegExp; output: string; times: number }[] = [];

  /** When true, the readiness probe never succeeds (drives the no-server test). */
  probeNeverReady = false;

  /**
   * Make the next `times` commands matching `match` exit non-zero.
   * Later tickets use this to drive build failures.
   */
  failCommand(match: RegExp, output: string, times = 1): void {
    this.#failures.push({ match, output, times });
  }

  async create(workspaceId: string): Promise<string> {
    const sandboxId = `fake-sandbox-${this.#nextId++}-${workspaceId}`;
    this.files.set(sandboxId, new Map());
    return sandboxId;
  }

  async writeFile(sandboxId: string, path: string, content: string): Promise<void> {
    const fs = this.files.get(sandboxId);
    if (!fs) throw new Error(`no such sandbox: ${sandboxId}`);
    fs.set(path, content);
  }

  async readFile(sandboxId: string, path: string): Promise<string> {
    const content = this.files.get(sandboxId)?.get(path);
    if (content === undefined) throw new Error(`no such file: ${path}`);
    return content;
  }

  async runCommand(
    sandboxId: string,
    cmd: string,
    _opts?: { timeoutMs?: number },
  ): Promise<{ exitCode: number; output: string }> {
    this.commands.push({ sandboxId, cmd });

    const failure = this.#failures.find((f) => f.times > 0 && f.match.test(cmd));
    if (failure) {
      failure.times -= 1;
      return { exitCode: 1, output: failure.output };
    }
    // The dev-server readiness probe: a healthy sandbox answers 200.
    if (
      !this.probeNeverReady &&
      cmd.includes('%{http_code}') &&
      (cmd.includes('localhost:') || cmd.includes('127.0.0.1:'))
    ) {
      return { exitCode: 0, output: '200' };
    }
    return { exitCode: 0, output: '' };
  }

  async runBackground(sandboxId: string, cmd: string): Promise<string> {
    this.background.push({ sandboxId, cmd });
    return `bg-${this.background.length}`;
  }

  async getPreviewHost(sandboxId: string, port: number): Promise<string> {
    return `${port}-${sandboxId}.e2b.app`;
  }

  async pause(sandboxId: string): Promise<void> {
    this.paused.add(sandboxId);
  }

  async resume(sandboxId: string): Promise<string> {
    this.paused.delete(sandboxId);
    return sandboxId;
  }

  async kill(sandboxId: string): Promise<void> {
    this.killed.add(sandboxId);
    this.files.delete(sandboxId);
  }

  /** Convenience for assertions: the paths written to a sandbox, sorted. */
  pathsIn(sandboxId: string): string[] {
    return [...(this.files.get(sandboxId)?.keys() ?? [])].sort();
  }

  /** Convenience for assertions: every path written across all sandboxes. */
  allPaths(): string[] {
    return [...this.files.values()].flatMap((fs) => [...fs.keys()]).sort();
  }
}
