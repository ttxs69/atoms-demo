import { Sandbox } from 'e2b';
import type { SandboxPort } from './sandbox-port.ts';

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
      lifecycle: { onTimeout: 'pause' },
    });
    return sandbox.sandboxId;
  }

  async writeFile(sandboxId: string, path: string, content: string): Promise<void> {
    const sandbox = await Sandbox.connect(sandboxId, { apiKey: this.#apiKey });
    await sandbox.files.write(path, content);
  }

  async readFile(sandboxId: string, path: string): Promise<string> {
    const sandbox = await Sandbox.connect(sandboxId, { apiKey: this.#apiKey });
    // The default overload returns text; the explicit format keeps that true
    // even if the SDK's default ever changes.
    return await sandbox.files.read(path, { format: 'text' });
  }

  async runCommand(
    sandboxId: string,
    cmd: string,
  ): Promise<{ exitCode: number; output: string }> {
    const sandbox = await Sandbox.connect(sandboxId, { apiKey: this.#apiKey });
    const result = await sandbox.commands.run(cmd);
    return {
      exitCode: result.exitCode,
      output: result.exitCode === 0 ? result.stdout : result.stderr || result.stdout,
    };
  }

  async pause(sandboxId: string): Promise<void> {
    const sandbox = await Sandbox.connect(sandboxId, { apiKey: this.#apiKey });
    await sandbox.pause();
  }

  async resume(sandboxId: string): Promise<string> {
    // E2B auto-resumes on connect; this explicit call is used by the orchestrator
    // when it needs to confirm the sandbox is running before surfacing a URL.
    const sandbox = await Sandbox.connect(sandboxId, { apiKey: this.#apiKey });
    return sandbox.sandboxId;
  }

  async kill(sandboxId: string): Promise<void> {
    await Sandbox.kill(sandboxId, { apiKey: this.#apiKey });
  }
}
