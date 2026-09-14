const URL = 'https://forge-app-production-b189.up.railway.app';

console.log('1. 模拟用户首次访问 /');
const cookies = [];

// 浏览器先访问 / → 触发匿名登录
const r1 = await fetch(URL + '/');
const html = await r1.text();
const setCookie1 = r1.headers.get('set-cookie') || '';
console.log('  /  set-cookie:', setCookie1.slice(0, 100));

// 浏览器的匿名 sign-in 完成后，调用 /api/generate
console.log('\n2. 用户输入消息，触发 generate');
const r2 = await fetch(URL + '/api/generate', {
  method: 'POST',
  headers: {
    'content-type': 'application/json',
    cookie: setCookie1.split(';')[0],
  },
  body: JSON.stringify({ message: '做一个待办清单' }),
});
const body = await r2.text();
console.log('  status:', r2.status);
console.log('  body:', body.slice(0, 200));
