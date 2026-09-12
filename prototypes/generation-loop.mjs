#!/usr/bin/env node
/**
 * THROWAWAY PROTOTYPE — ticket 09 (生成循环的用户体验)
 *
 * 回答的问题：用户按下发送之后到看到应用跑起来，每一刻看到什么？
 *
 * 为什么是可运行的状态机而不是静态 wireframe：
 * ticket 09 的核心是**时间维度**——等待多久、进度是否真实、失败时保留什么、
 * 中断后剩什么、第二轮修改如何呈现。静态图看不出这些，跑一遍能看出来。
 *
 * 事件契约来自 ticket 06 已定的 ForgeEvent：
 *   agent_started / text_delta / tool_call_start / tool_input_delta
 *   / tool_result / agent_done / error
 * 本原型额外加了三个（见下方 EXTRA_EVENTS），它们是跑这一遍才发现缺的。
 *
 * 用法：
 *   node prototypes/generation-loop.mjs happy
 *   node prototypes/generation-loop.mjs autofix
 *   node prototypes/generation-loop.mjs interrupt
 *   node prototypes/generation-loop.mjs iterate
 *   node prototypes/generation-loop.mjs rlsfail
 *   node prototypes/generation-loop.mjs exhausted
 *   node prototypes/generation-loop.mjs all
 *
 * SPEED=0 node ... 可关掉模拟延时，只看序列。
 */

const SPEED = process.env.SPEED === undefined ? 1 : Number(process.env.SPEED);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms * SPEED));

// ─────────────────────────────────────────────────────────────────
// 本原型发现 ticket 06 的 ForgeEvent 缺了这三个。跑一遍才看出来。
// ─────────────────────────────────────────────────────────────────
const EXTRA_EVENTS = {
  plan_ready:
    '骨架先行：Emma 出 spec 后立刻给出文件清单，让文件树先长出来（灰色占位），' +
    '再由 Alex 逐个填充。没有它，用户在首个文件写完前只能看 spinner。',
  gate_started:
    'ticket 08 的两道安全门控需要在 UI 上可见——migration 执行 + Security Advisor 扫描' +
    '合计可能 5-15 秒，静默会被当成卡死。',
  sandbox_state:
    'E2B 沙箱有 pause/resume（ticket 12）。resume 约 1 秒，但用户回到一个旧会话时' +
    '必须知道"正在恢复"，否则会以为坏了。',
};

// ─────────────────────────────────────────────────────────────────
// 状态机
// ─────────────────────────────────────────────────────────────────
const STATES = {
  idle: ['submitting'],
  submitting: ['reserving', 'blocked_credits'],   // 预扣额度（ticket 07）
  reserving: ['sandbox_booting'],
  sandbox_booting: ['understanding'],             // E2B create / resume
  understanding: ['planning'],                    // @lead 分派 → @pm 出 spec
  planning: ['generating'],                       // 文件清单就绪 → 骨架显现
  // 'building' discovered running iterate variant: second-round edits skip npm install
  generating: ['installing', 'building', 'interrupted', 'failed'],
  installing: ['migrating', 'building', 'failed', 'autofixing'],
  migrating: ['gating', 'failed'],                // 仅需要后端时
  gating: ['building', 'gate_failed'],            // RLS 模板 + Security Advisor
  building: ['previewing', 'autofixing', 'failed'],
  autofixing: ['building', 'gave_up'],            // 有界重试
  previewing: ['settling', 'idle_iterate'],
  settling: ['idle_iterate'],                     // 结算退差（ticket 07）
  idle_iterate: ['submitting'],                   // 多轮修改（ticket 10 Q1=a）
  interrupted: ['idle_iterate'],
  failed: ['autofixing', 'idle_iterate'],
  gate_failed: ['idle_iterate'],                  // 安全门控不重试，直接拒绝
  gave_up: ['idle_iterate'],
  blocked_credits: ['idle'],
};

let state = 'idle';
const transition = (next) => {
  if (!STATES[state]?.includes(next)) {
    throw new Error(`非法状态迁移: ${state} -> ${next}`);
  }
  state = next;
};

// ─────────────────────────────────────────────────────────────────
// 渲染：模拟用户实际看到的界面
// ─────────────────────────────────────────────────────────────────
const W = 74;
const line = (c = '─') => c.repeat(W);
const box = (s) => console.log(s);

let files = [];        // { path, status: 'planned'|'writing'|'done', bytes }
let logLines = [];
let credits = { reserved: 0, used: 0, balance: 120 };
let elapsed = 0;

const tick = async (ms, label) => {
  elapsed += ms;
  await sleep(ms);
  if (label) logLines.push(label);
};

function render(headline, opts = {}) {
  console.clear?.();
  box(line('═'));
  box(`  Forge  ·  ${headline}`);
  box(line('═'));

  // 文件树：骨架先行的关键。planned 是灰色占位。
  if (files.length) {
    box('');
    box('  FILES');
    for (const f of files) {
      const mark =
        f.status === 'done' ? '✓' : f.status === 'writing' ? '▶' : '·';
      const dim = f.status === 'planned' ? '  (待生成)' : '';
      const size = f.bytes ? `  ${f.bytes}B` : '';
      box(`   ${mark} ${f.path}${size}${dim}`);
    }
  }

  if (opts.stream) {
    box('');
    box('  ┌─ 正在写入 ' + opts.stream.path);
    for (const l of opts.stream.lines) box('  │ ' + l);
    box('  └─' + (opts.stream.done ? ' 完成' : ' …'));
  }

  if (logLines.length) {
    box('');
    box('  ACTIVITY');
    for (const l of logLines.slice(-6)) box('   ' + l);
  }

  if (opts.preview) {
    box('');
    box('  ┌' + '─'.repeat(W - 6) + '┐');
    box('  │' + '  [ 预览 iframe ]'.padEnd(W - 6) + '│');
    box('  │' + `  ${opts.preview}`.padEnd(W - 6) + '│');
    box('  └' + '─'.repeat(W - 6) + '┘');
  }

  if (opts.action) {
    box('');
    box('  ▸ ' + opts.action);
  }

  box('');
  box(
    `  state=${state}  ·  ${(elapsed / 1000).toFixed(1)}s  ·  ` +
      `额度 冻结${credits.reserved} 已用${credits.used} 余${credits.balance}`
  );
  box(line());
  box('');
}

// ─────────────────────────────────────────────────────────────────
// 公共片段
// ─────────────────────────────────────────────────────────────────
async function reserveCredits(estimate, balance = 120) {
  credits = { reserved: 0, used: 0, balance };
  transition('submitting');
  render('提交中');
  await tick(200);

  if (balance < estimate) {
    transition('blocked_credits');
    render('额度不足', {
      action:
        `本次预计消耗约 ${estimate}，当前余额 ${balance}。\n` +
        '    明天 0:00 恢复每日额度，或升级账户立即继续。\n' +
        '    ——注意：任务未启动，不会产生半成品，也不扣额度。',
    });
    await tick(400);
    return false;
  }

  transition('reserving');
  credits.reserved = estimate;
  logLines.push(`额度已冻结 ${estimate}（行锁 + 幂等键，ticket 07）`);
  render('校验额度');
  await tick(300);
  return true;
}

async function bootSandbox({ resume = false } = {}) {
  transition('sandbox_booting');
  logLines.push(
    resume
      ? 'E2B sandbox_state: resuming（约 1s，ticket 12）'
      : 'E2B sandbox_state: creating'
  );
  render(resume ? '恢复你上次的工作区' : '准备运行环境');
  await tick(resume ? 900 : 1400);
}

async function understandAndPlan(spec, plannedFiles) {
  transition('understanding');
  logLines.push('agent_started @lead — Mike 正在理解需求');
  render('Mike 正在理解你的需求');
  await tick(1200);

  logLines.push('@lead 分派 → @pm（Emma）');
  logLines.push('agent_started @pm — Emma 正在拆解需求');
  render('Emma 正在把需求拆成实现清单');
  await tick(1800);

  transition('planning');
  logLines.push('agent_done @pm');
  logLines.push('plan_ready — 文件清单就绪（骨架先行）');
  files = plannedFiles.map((p) => ({ path: p, status: 'planned' }));
  render('已确定要做什么', { action: `Emma: ${spec}` });
  await tick(700);
}

async function generateFiles(fileSpecs) {
  transition('generating');
  logLines.push('agent_started @eng — Alex 开始写代码');

  for (const spec of fileSpecs) {
    const f = files.find((x) => x.path === spec.path);
    f.status = 'writing';
    logLines.push(`tool_call_start write_file ${spec.path}`);

    const shown = [];
    for (const l of spec.lines) {
      shown.push(l);
      render('Alex 正在写代码', {
        stream: { path: spec.path, lines: shown, done: false },
      });
      await tick(260);
    }
    f.status = 'done';
    f.bytes = spec.lines.join('\n').length;
    logLines.push(`tool_result write_file ${spec.path} ok`);
    render('Alex 正在写代码', {
      stream: { path: spec.path, lines: shown, done: true },
    });
    await tick(200);
  }
}

async function install() {
  transition('installing');
  logLines.push('tool_call_start run_command "npm install"');
  render('安装依赖');
  await tick(2200);
  logLines.push('tool_result npm install ok（142 packages）');
}

async function migrateAndGate({ pass = true } = {}) {
  transition('migrating');
  logLines.push('tool_call_start run_migration（agent 生成的 SQL）');
  render('创建数据表', {
    action: '需要保存数据，正在为你准备数据库',
  });
  await tick(1500);

  logLines.push('平台注入 RLS 模板：ENABLE RLS + REVOKE + workspace_isolation');
  logLines.push('  ↳ agent 无法 opt-out（ticket 08 门控 1）');
  render('创建数据表');
  await tick(900);

  transition('gating');
  logLines.push('gate_started — Security Advisor 扫描（ticket 08 门控 2）');
  render('安全检查', {
    action: '正在确认你的数据只有你能访问',
  });
  await tick(1800);

  if (!pass) {
    transition('gate_failed');
    logLines.push('✗ LINT_0024_PERMISSIVE_RLS_POLICY 检出');
    render('安全检查未通过', {
      action:
        '检测到一条过宽的数据访问策略，已回滚，未对外暴露任何数据。\n' +
        '    Alex 会重写这部分——安全问题不自动重试，需要你确认后继续。\n' +
        '    [ 让 Alex 重写 ]   [ 查看详情 ]',
    });
    await tick(600);
    return false;
  }

  logLines.push('✓ Security Advisor 通过');
  return true;
}

async function build({ fail = false } = {}) {
  transition('building');
  logLines.push('tool_call_start run_command "npm run build"');
  render('构建应用');
  await tick(1800);

  if (fail) {
    transition('failed');
    logLines.push('✗ error — TS2304: Cannot find name "TodoItem" (src/App.tsx:14)');
    render('构建失败', {
      action:
        '出了点问题，Alex 正在自己修。\n' +
        '    TS2304: Cannot find name "TodoItem" — src/App.tsx:14\n' +
        '    [ 查看完整日志 ]',
    });
    await tick(700);
    return false;
  }
  logLines.push('✓ build ok');
  return true;
}

async function autofix(attempt, max = 3) {
  transition('autofixing');
  logLines.push(`autofix 第 ${attempt}/${max} 次 — 错误上下文已注入`);
  render(`Alex 正在修复（第 ${attempt} 次，最多 ${max} 次）`, {
    action:
      '这一步不消耗额外额度上限——预扣时已按保守上界冻结（ticket 07）。',
  });
  await tick(1600);
}

async function previewAndSettle(url, actual) {
  transition('previewing');
  logLines.push(`预览就绪 getHost(3000) → ${url}`);
  render('应用已跑起来', { preview: url });
  await tick(900);

  transition('settling');
  credits.used = actual;
  credits.balance -= actual;
  credits.reserved = 0;
  logLines.push(`结算：实扣 ${actual}，冻结差额已退还`);
  render('应用已跑起来', {
    preview: url,
    action: '本次消耗已结算。继续对话即可修改。',
  });
  await tick(500);

  transition('idle_iterate');
}

// ─────────────────────────────────────────────────────────────────
// 变体
// ─────────────────────────────────────────────────────────────────
const scenarios = {
  async happy() {
    if (!(await reserveCredits(18))) return;
    await bootSandbox();
    await understandAndPlan(
      '一个记录每日心情的应用：日期 + 心情等级 + 备注，本地保存。',
      ['index.html', 'src/main.tsx', 'src/App.tsx', 'src/MoodCard.tsx']
    );
    await generateFiles([
      { path: 'index.html', lines: ['<!doctype html>', '<div id="root">'] },
      { path: 'src/main.tsx', lines: ['import React from "react"', 'createRoot(...)'] },
      {
        path: 'src/App.tsx',
        lines: [
          'export default function App() {',
          '  const [moods, setMoods] = useState([])',
          '  return <main className="p-6">',
        ],
      },
      { path: 'src/MoodCard.tsx', lines: ['export function MoodCard({ mood })'] },
    ]);
    await install();
    await build();
    await previewAndSettle('https://3000-ixk2f9.e2b.app', 14);
    render('完成', {
      preview: 'https://3000-ixk2f9.e2b.app',
      action: '想改什么直接说，比如"把卡片改成网格排列"。',
    });
  },

  async autofix() {
    if (!(await reserveCredits(22))) return;
    await bootSandbox();
    await understandAndPlan('一个待办清单，可增删、可标记完成。', [
      'index.html',
      'src/App.tsx',
      'src/TodoList.tsx',
    ]);
    await generateFiles([
      { path: 'index.html', lines: ['<!doctype html>'] },
      { path: 'src/App.tsx', lines: ['import { TodoList } from "./TodoList"'] },
      { path: 'src/TodoList.tsx', lines: ['export function TodoList()'] },
    ]);
    await install();
    if (!(await build({ fail: true }))) {
      await autofix(1);
      await build();
    }
    await previewAndSettle('https://3000-p8xz1a.e2b.app', 19);
    render('完成（自修复 1 次）', {
      preview: 'https://3000-p8xz1a.e2b.app',
      action: '构建曾失败一次，Alex 已自行修复。[ 查看当时的错误 ]',
    });
  },

  async interrupt() {
    if (!(await reserveCredits(18))) return;
    await bootSandbox();
    await understandAndPlan('一个番茄钟。', [
      'index.html',
      'src/App.tsx',
      'src/Timer.tsx',
      'src/Settings.tsx',
    ]);
    transition('generating');
    logLines.push('agent_started @eng');
    files[0].status = 'done';
    files[0].bytes = 82;
    files[1].status = 'writing';
    render('Alex 正在写代码', {
      stream: { path: 'src/App.tsx', lines: ['export default function App() {'], done: false },
      action: '[ 停止 ]  ← 用户在这里点了停止',
    });
    await tick(1200);

    transition('interrupted');
    credits.used = 6;
    credits.balance -= 6;
    credits.reserved = 0;
    logLines.push('用户中断 — 已完成的文件保留，冻结额度按实际用量结算');
    transition('idle_iterate');
    render('已停止', {
      action:
        '已生成的文件保留了，未开始的没有产生消耗。\n' +
        '    只按已用的 6 点结算。\n' +
        '    [ 继续刚才的 ]   [ 换个方向重来 ]',
    });
  },

  async iterate() {
    // 第二轮：ticket 10 砍掉了 diff 视图，所以"改了什么"必须靠别的方式传达
    files = [
      { path: 'index.html', status: 'done', bytes: 82 },
      { path: 'src/App.tsx', status: 'done', bytes: 412 },
      { path: 'src/MoodCard.tsx', status: 'done', bytes: 168 },
    ];
    credits = { reserved: 0, used: 0, balance: 106 };
    state = 'idle_iterate';
    render('第二轮修改', {
      preview: 'https://3000-ixk2f9.e2b.app',
      action: '用户: "把卡片改成网格排列，一行三个"',
    });
    await tick(800);

    if (!(await reserveCredits(8, 106))) return;
    await bootSandbox({ resume: true });

    transition('understanding');
    logLines.push('复用同一 Mastra thread（ticket 06 Q2=a 共享 history）');
    render('Mike 正在理解修改要求');
    await tick(1000);
    transition('planning');
    logLines.push('plan_ready — 本次只动 1 个文件');
    render('确定改动范围', {
      action: '只需要改 src/MoodCard.tsx —— 其余文件不动。',
    });
    await tick(700);

    await generateFiles([
      {
        path: 'src/MoodCard.tsx',
        lines: ['<div className="grid grid-cols-3 gap-4">'],
      },
    ]);
    await build();
    await previewAndSettle('https://3000-ixk2f9.e2b.app', 6);
    render('改好了', {
      preview: 'https://3000-ixk2f9.e2b.app',
      action:
        '本轮改了 1 个文件：src/MoodCard.tsx\n' +
        '    ——没有 diff 视图（ticket 10 已砍），靠"本轮动了哪些文件"传达改动范围。',
    });
  },

  async rlsfail() {
    if (!(await reserveCredits(28))) return;
    await bootSandbox();
    await understandAndPlan(
      '一个共享的读书笔记应用，要能登录，笔记要保存到数据库。',
      ['index.html', 'src/App.tsx', 'src/Auth.tsx', 'supabase/migrations/001_notes.sql']
    );
    await generateFiles([
      { path: 'index.html', lines: ['<!doctype html>'] },
      { path: 'src/App.tsx', lines: ['const supabase = createClient(url, PUBLISHABLE_KEY)'] },
      { path: 'src/Auth.tsx', lines: ['await supabase.auth.signInWithOtp(...)'] },
      {
        path: 'supabase/migrations/001_notes.sql',
        lines: ['create table notes (', '  id uuid primary key,'],
      },
    ]);
    await install();
    await migrateAndGate({ pass: false });
  },

  async exhausted() {
    await reserveCredits(18, 4);   // 余额不足
  },
};

// ─────────────────────────────────────────────────────────────────
const which = process.argv[2] || 'happy';
const order = ['happy', 'autofix', 'interrupt', 'iterate', 'rlsfail', 'exhausted'];

const reset = () => {
  state = 'idle';
  files = [];
  logLines = [];
  elapsed = 0;
  credits = { reserved: 0, used: 0, balance: 120 };
};

if (which === 'all') {
  for (const s of order) {
    reset();
    console.log('\n\n' + '█'.repeat(W));
    console.log('█  变体: ' + s);
    console.log('█'.repeat(W) + '\n');
    await scenarios[s]();
    await sleep(600);
  }
} else if (scenarios[which]) {
  await scenarios[which]();
} else {
  console.log('未知变体。可选: ' + order.join(', ') + ', all');
  process.exit(1);
}

console.log('\n本原型发现 ForgeEvent 契约缺三个事件：');
for (const [k, v] of Object.entries(EXTRA_EVENTS)) {
  console.log(`\n  ${k}\n    ${v}`);
}
console.log('');
