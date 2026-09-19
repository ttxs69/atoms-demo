import type { SupabaseClient } from '@supabase/supabase-js';
import type { SandboxPort } from './sandbox-port.ts';

/**
 * Port: the artifact checkpoint (docs/04-persistence.md §3.3).
 *
 * Latest-wins snapshot of the workspace tree in object storage, keyed by
 * workspace id (not project id) so GC's deletion_queue rows delete snapshot
 * objects directly. Content is a JSON object { path → content } — same
 * text-only contract the zip export already has, but readable without a
 * unzip implementation.
 */
export interface SnapshotPort {
  /** Persist the current tree. Returns the file count (0 = nothing to save). */
  save(workspaceId: string): Promise<number>;
  /** The latest snapshot, or null when none exists / unreadable. */
  load(workspaceId: string): Promise<Map<string, string> | null>;
}

/** Mirrors the zip export's exclusions: npm-regenerated and dot files.
 * Exported for its test — the trust boundary that keeps .env (and friends)
 * out of snapshots; the pipeline regenerates .env on the next turn. */
export function isSnapshotPath(path: string): boolean {
  const EXCLUDED_FILES = new Set(['package-lock.json', 'tsconfig.tsbuildinfo']);
  const segments = path.split('/');
  return segments.every(
    (segment) =>
      !segment.startsWith('.') &&
      !EXCLUDED_FILES.has(segment) &&
      segment !== 'node_modules',
  );
}

export function supabaseSnapshot(
  db: SupabaseClient,
  sandbox: SandboxPort,
  bucket = 'project-snapshots',
): SnapshotPort {
  return {
    async save(workspaceId) {
      // Called HOT (orchestrator, before the turn-end pause) — the route's
      // post-stream save raced the pause and hung on E2B's pause transition;
      // keeping the checkpoint inside the pipeline eliminates the race by
      // construction (docs/04 §3.3).
      const sandboxId = await sandbox.findSandbox(workspaceId);
      if (sandboxId === null) return 0;

      const paths = (await sandbox.listFiles(sandboxId, '.'))
        .map((p) => p.replace(/^\.\//, ''))
        .filter(isSnapshotPath);

      const files: Record<string, string> = {};
      for (const path of paths) {
        try {
          files[path] = await sandbox.readFile(sandboxId, path);
        } catch {
          // unreadable file: snapshot the rest, never fail the save
        }
      }
      const count = Object.keys(files).length;
      if (count === 0) return 0;

      const { error } = await db.storage
        .from(bucket)
        .upload(`${workspaceId}.json`, JSON.stringify(files), {
          upsert: true,
          contentType: 'application/json',
        });
      if (error) throw new Error(error.message);
      return count;
    },

    async load(workspaceId) {
      const { data, error } = await db.storage.from(bucket).download(`${workspaceId}.json`);
      if (error || !data) return null;
      try {
        const parsed = JSON.parse(await data.text()) as Record<string, unknown>;
        const files = new Map<string, string>();
        for (const [path, content] of Object.entries(parsed)) {
          if (typeof content === 'string') files.set(path, content);
        }
        return files;
      } catch {
        return null;
      }
    },
  };
}
