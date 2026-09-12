import { Sandbox } from 'e2b';
import { buildZip } from '../../../transport/zip.ts';

export const runtime = 'nodejs';

/**
 * Export the session's app as a zip.
 *
 * Contains everything needed to run after unzip (package.json, configs, all
 * source) and deliberately nothing that npm regenerates (node_modules, .git,
 * dist, tsconfig.tsbuildinfo). A paused sandbox auto-resumes on connect.
 *
 * GET /api/export?session=... → application/zip attachment.
 */
const EXCLUDED_DIRS = new Set(['node_modules', '.git', 'dist', '.cache']);
const EXCLUDED_FILES = new Set(['tsconfig.tsbuildinfo', 'package-lock.json']);

async function collectFiles(
  sandbox: Awaited<ReturnType<typeof Sandbox.connect>>,
  dir: string,
): Promise<string[]> {
  const out: string[] = [];
  const entries = await sandbox.files.list(dir === '' ? '.' : dir);
  for (const entry of entries) {
    const full = dir === '' ? entry.name : `${dir}/${entry.name}`;
    if (entry.type === 'dir') {
      // Dot-dirs (.npm cache with thousands of entries, .git, .cache) and
      // build output never belong in the export — and walking .npm hangs.
      if (EXCLUDED_DIRS.has(entry.name) || entry.name.startsWith('.')) continue;
      out.push(...(await collectFiles(sandbox, full)));
    } else if (
      !EXCLUDED_FILES.has(entry.name) &&
      !entry.name.startsWith('.')
    ) {
      out.push(full);
    }
  }
  return out;
}

export async function GET(request: Request): Promise<Response> {
  const apiKey = process.env['E2B_API_KEY'];
  if (!apiKey) {
    return Response.json({ error: 'Server is missing E2B_API_KEY.' }, { status: 503 });
  }

  const session = new URL(request.url).searchParams.get('session');
  if (!session) {
    return Response.json({ error: 'session is required.' }, { status: 400 });
  }

  console.time('export:list');
  const paginator = Sandbox.list({ apiKey, query: { metadata: { workspace_id: session } } });
  let page = await paginator.nextItems();
  const sandboxes = [...page];
  while (paginator.hasNext) {
    page = await paginator.nextItems();
    sandboxes.push(...page);
  }
  console.timeEnd('export:list');
  console.time('export:connect');
  if (sandboxes.length === 0) {
    return Response.json({ error: 'No sandbox for this session yet.' }, { status: 404 });
  }
  const sandbox = await Sandbox.connect(sandboxes[0]!.sandboxId, { apiKey });
  console.timeEnd('export:connect');
  console.time('export:getinfo');
  // getInfo() resumes a paused sandbox (per the API docs) — filesystem ops
  // against a paused sandbox queue indefinitely instead of waking it.
  await sandbox.getInfo();

  console.timeEnd('export:getinfo');
  console.time('export:collect');
  const paths = await collectFiles(sandbox, '');
  console.timeEnd('export:collect');
  console.time('export:zip');
  if (!paths.includes('package.json')) {
    return Response.json({ error: 'Nothing to export yet.' }, { status: 404 });
  }

  const files = new Map<string, string>();
  for (const path of paths) {
    files.set(path, await sandbox.files.read(path, { format: 'text' }));
  }
  const blob = buildZip(files);

  console.timeEnd('export:zip');
  console.log('export: files=' + paths.length + ' bytes=' + blob.length);
  return new Response(new Uint8Array(blob), {
    headers: {
      'content-type': 'application/zip',
      'content-disposition': `attachment; filename="forge-app-${session}.zip"`,
      'cache-control': 'no-store',
    },
  });
}
