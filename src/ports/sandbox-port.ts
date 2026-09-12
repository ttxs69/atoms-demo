/**
 * Port: the sandbox.
 *
 * Wraps all E2B calls. Orchestrator never imports the E2B SDK directly.
 *
 * Note: every sandbox created in production must carry
 * `metadata: { workspace_id }` so GC can locate it via `Sandbox.list()`.
 * The sandbox implementation, not this interface, is responsible for that.
 */
export interface SandboxPort {
  create(workspaceId: string): Promise<string>; // returns sandboxId
  writeFile(sandboxId: string, path: string, content: string): Promise<void>;
  readFile(sandboxId: string, path: string): Promise<string>;
  runCommand(
    sandboxId: string,
    cmd: string,
    opts?: { timeoutMs?: number },
  ): Promise<{ exitCode: number; output: string }>;
  /** Start a long-running process (dev server). Returns a process id. */
  runBackground(sandboxId: string, cmd: string): Promise<string>;
  /** The public host for a port — the URL the preview iframe loads. */
  getPreviewHost(sandboxId: string, port: number): Promise<string>;
  pause(sandboxId: string): Promise<void>;
  /** Returns the id the sandbox ended up with. */
  resume(sandboxId: string): Promise<string>;
  kill(sandboxId: string): Promise<void>;
}
