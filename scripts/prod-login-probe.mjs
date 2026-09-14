import { config } from 'dotenv';
config({ path: '.env' });

const APPS_URL = process.env.APPS_SUPABASE_URL;
const APPS_SEC = process.env.APPS_SUPABASE_SECRET_KEY;
const APPS_PUB = process.env.APPS_SUPABASE_PUBLISHABLE_KEY;
const { createClient } = await import('@supabase/supabase-js');

const admin = createClient(APPS_URL, APPS_SEC, { auth: { persistSession: false } });
const email = `probe-login-${Date.now()}@gmail.com`;

// ① 用户不存在则创建（邮件点链接的等价前提）
await admin.auth.admin.createUser({ email, email_confirm: true });

// ② 生成 magic link（等价于邮件里那条链接）
const { data: link, error: lErr } = await admin.auth.admin.generateLink({ type: 'magiclink', email });
if (lErr) { console.log('✗ generateLink:', lErr.message); process.exit(1); }
const actionUrl = new URL(link.properties.action_link);
const tokenHash = actionUrl.searchParams.get('token_hash') ?? new URLSearchParams(actionUrl.search).get('token');
console.log('① action_link host:', actionUrl.host, '| redirect_to:', actionUrl.searchParams.get('redirect_to'));

// ③ 换真实 session（= 用户点链接后 supabase-js 在浏览器里干的事）
const { data: ver, error: vErr } = await admin.auth.verifyOtp({ token_hash: tokenHash, type: 'magiclink' });
if (vErr || !ver.session) { console.log('✗ verifyOtp:', vErr?.message); process.exit(1); }
console.log('② 拿到真实用户 JWT ✓ user:', ver.user.id.slice(0, 8));

// ④ 模拟 /auth/confirm 的 POST /api/auth/session
const res = await fetch(process.env.PROD + '/api/auth/session', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ accessToken: ver.session.access_token }),
});
console.log('③ POST /api/auth/session →', res.status);
const setCookie = res.headers.get('set-cookie') ?? '';
console.log('   set-cookie:', setCookie.slice(0, 60) + '...');
if (!res.ok) { console.log('   body:', await res.text()); process.exit(1); }

// ⑤ 模拟跳回首页后的 /api/auth/me
const me = await fetch(process.env.PROD + '/api/auth/me', {
  headers: { cookie: setCookie.split(';')[0] },
});
console.log('④ GET /api/auth/me →', me.status, await me.text());
