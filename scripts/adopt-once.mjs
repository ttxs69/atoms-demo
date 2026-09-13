// 一次性认领：把孤儿应用拷贝到当前身份（bc820dcf…）的新沙箱
import { Sandbox } from 'e2b';
import { readFileSync } from 'node:fs';

const env = Object.fromEntries(
  readFileSync('.env', 'utf8').split('\n')
    .filter(l => l.includes('=') && !l.startsWith('#'))
    .map(l => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()])
);
const KEY = env.E2B_API_KEY;
const CURRENT_USER = 'bc820dcf-febb-44e5-bb2e-a51665ac4406'; // 最新登录 = 浏览器当前身份
const SOURCE = 'ik520bc46bd4ewhwszvrv';

// 1. 清 e2e 垃圾
for (const garbage of ['iyilx2j710qh0o6c401es', 'i5ofs0hxoysl62x7228br']) {
  await Sandbox.kill(garbage, { apiKey: KEY });
  console.log('killed garbage', garbage);
}

// 2. 递归收集源文件（跳过点前缀）
async function collect(sb, dir, out) {
  const entries = await sb.files.list(dir === '' ? '.' : dir);
  for (const e of entries) {
    const full = dir === '' ? e.name : `${dir}/${e.name}`;
    if (e.type === 'dir') {
      if (e.name.startsWith('.') || e.name === 'node_modules') continue;
      await collect(sb, full, out);
    } else if (!e.name.startsWith('.')) {
      out.push(full);
    }
  }
  return out;
}

const src = await Sandbox.connect(SOURCE, { apiKey: KEY });
await src.getInfo(); // 唤醒
const paths = await collect(src, '', []);
console.log('copying', paths.length, 'files:', paths.join(', '));

// 3. 新沙箱（当前身份的 metadata + pause 生命周期，与生成路径一致）
const fresh = await Sandbox.create({
  apiKey: KEY,
  metadata: { workspace_id: CURRENT_USER },
  lifecycle: { onTimeout: 'pause', autoResume: true },
});
console.log('new sandbox', fresh.sandboxId);

// 4. 逐文件拷贝
for (const p of paths) {
  const content = await src.files.read(p, { format: 'text' });
  await fresh.files.write(p, content);
  console.log('  →', p);
}

// 5. install + dev server（和管线一致），就绪后暂停（auto-resume 会唤醒）
await fresh.commands.run('npm install --no-audit --no-fund', { timeoutMs: 300000 });
console.log('installed');
await fresh.commands.run('npm run dev -- --host 0.0.0.0 --port 3000 --strictPort', { background: true });
for (let i = 0; i < 20; i++) {
  const probe = await fresh.commands
    .run('curl -s -o /dev/null -w %{http_code} http://127.0.0.1:3000', { timeoutMs: 5000 })
    .catch(() => ({ exitCode: 1, stdout: '' }));
  if (probe.exitCode === 0 && probe.stdout.trim() === '200') break;
  await new Promise(r => setTimeout(r, 1000));
}
const host = fresh.getHost(3000);
const status = await fetch(`https://${host}`).then(r => r.status).catch(() => 'ERR');
console.log('preview', `https://${host}`, '→', status);
await fresh.pause();
console.log('paused; refresh the page — /api/preview should adopt it');
