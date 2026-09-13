import { Sandbox } from 'e2b';
import { sessionVerifierFromEnv } from '../../../auth/session.ts';

export const runtime = 'nodejs';

/**
 * Returning-visitor preview restoration: find the workspace's sandbox by
 * metadata, wake it (getInfo resumes a paused sandbox — the export route's
 * lesson), and hand back the preview URL plus the current file tree so the
 * UI can redraw the workspace instead of showing a blank page.
 *
 * GET /api/preview → 200 { url, files } | 404 nothing yet
 */
export async function GET(request: Request): Promise<Response> {
  const sessionId = await sessionVerifierFromEnv().verify(request);
  if (!sessionId) {
    return Response.json({ error: 'No session.' }, { status: 401 });
  }
  const apiKey = process.env['E2B_API_KEY'];
  if (!apiKey) {
    return Response.json({ error: 'Server is missing E2B_API_KEY.' }, { status: 503 });
  }

  const paginator = Sandbox.list({
    apiKey,
    query: { metadata: { workspace_id: sessionId } },
  });
  let page = await paginator.nextItems();
  const found = [...page];
  while (paginator.hasNext) {
    page = await paginator.nextItems();
    found.push(...page);
  }
  if (found.length === 0) {
    return Response.json({ error: 'Nothing here yet.' }, { status: 404 });
  }

  const sandbox = await Sandbox.connect(found[0]!.sandboxId, { apiKey });
  // Filesystem ops on a paused sandbox queue forever; getInfo() resumes it.
  await sandbox.getInfo();

  let files: string[] = [];
  try {
    for (const dir of ['.', 'src']) {
      const entries = await sandbox.files.list(dir);
      for (const entry of entries) {
        if (entry.type !== 'file') continue;
        files.push(dir === '.' ? entry.name : `${dir}/${entry.name}`);
      }
    }
  } catch {
    /* empty project — just no tree */
  }

  return Response.json({ url: `https://${sandbox.getHost(3000)}`, files: files.sort() });
}
