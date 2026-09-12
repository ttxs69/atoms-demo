import { Sandbox } from 'e2b';

export const runtime = 'nodejs';

/**
 * Read-only code viewer backend.
 *
 * Locates the session's sandbox by metadata (the same mechanism GC uses —
 * `Sandbox.list({ metadata: { workspace_id } })`), which also auto-resumes a
 * paused sandbox on connect. GET /api/files?session=..&path=.. returns the
 * tree (no path) or one file's content (with path). Read-only by design:
 * there is no write verb here.
 */
export async function GET(request: Request): Promise<Response> {
  const apiKey = process.env['E2B_API_KEY'];
  if (!apiKey) {
    return Response.json({ error: 'Server is missing E2B_API_KEY.' }, { status: 503 });
  }

  const url = new URL(request.url);
  const session = url.searchParams.get('session');
  const path = url.searchParams.get('path');
  if (!session) {
    return Response.json({ error: 'session is required.' }, { status: 400 });
  }

  const paginator = Sandbox.list({ apiKey, query: { metadata: { workspace_id: session } } });
  let page = await paginator.nextItems();
  const sandboxes = [...page];
  while (paginator.hasNext) {
    page = await paginator.nextItems();
    sandboxes.push(...page);
  }
  if (sandboxes.length === 0) {
    return Response.json({ error: 'No sandbox for this session yet.' }, { status: 404 });
  }
  const sandboxId = sandboxes[0]!.sandboxId;
  const sandbox = await Sandbox.connect(sandboxId, { apiKey });
  // getInfo() resumes a paused sandbox (per the API docs) — filesystem ops
  // against a paused sandbox queue indefinitely instead of waking it.
  await sandbox.getInfo();

  if (path === null) {
    // Tree: scaffold + src, no node_modules noise.
    const tree: string[] = [];
    for (const dir of ['.', 'src']) {
      try {
        const entries = await sandbox.files.list(dir);
        for (const entry of entries) {
          if (entry.type !== 'file') continue;
          tree.push(dir === '.' ? entry.name : `${dir}/${entry.name}`);
        }
      } catch {
        /* directory absent — skip */
      }
    }
    return Response.json({ files: tree.sort() });
  }

  try {
    const content = await sandbox.files.read(path, { format: 'text' });
    return Response.json({ path, content });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : 'read failed' },
      { status: 404 },
    );
  }
}
