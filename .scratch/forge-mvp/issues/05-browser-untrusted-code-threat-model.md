# 05 — 浏览器内执行不可信代码的威胁模型

Type: research
Status: resolved
Blocked by: —

## Question

charting 时我给出的理由是"恶意代码问题从根上消失"。这是一个**安全断言**，
必须被验证而不是被相信——如果它错了，整个 Q5 决策要重来。

具体要回答：

- WebContainer 的隔离边界到底是什么？WASM + Service Worker？它如何拦截 syscall？
- LLM 生成的代码能否突破到：宿主页面的 DOM？`document.cookie`？`localStorage`？
  宿主页面的网络凭据？其他标签页？用户的文件系统？
- 能否发起任意跨域请求（SSRF 的浏览器版）？能否读取宿主页面已登录站点的响应？
- WebContainer 自身的漏洞历史：有无 CVE 或已公开的逃逸案例？
- **代价转嫁问题**：应用跑在**访客**的浏览器里，所以"平台安全"成立。但访客成了
  潜在的受害者——如果生成的应用是恶意的（用户 A 生成、用户 B 访问），
  B 面临什么风险？这与服务端沙箱相比，风险是转移了还是消除了？
- 如果生成的应用需要 API key（如 Supabase anon key），密钥对访客可见是否可接受？
  什么类型的密钥绝对不能放进前端？
- 平台侧还剩哪些真实的攻击面？（生成服务的提示词注入、LLM 供应商、CDN、
  发布环节的 XSS、账户系统）

结论要明确回答：**"服务端零执行所以平台安全"这个判断成立吗？代价是什么？**

## Answer

Resolved 2026-09-12. Sources: webcontainers.io official docs, StackBlitz engineering blog.

**Charting claim "malicious code disappears at root" is half-right. The wrong half matters more.**

What is true: generated code never runs on Forge's servers, eliminating server-side RCE,
container escape, and cross-tenant lateral movement. This is a real security gain.

What is wrong: risk is TRANSFERRED to the visitor, not eliminated. Malicious generated code runs
with full JavaScript privileges in the visitor's browser — can mine crypto, render a phishing
login, beacon keystrokes, or use the visitor's IP for outbound requests.

Key structural protection confirmed from primary sources: the WebContainer preview runs on an
INDEPENDENT ORIGIN (not same-origin as the Forge host page). This means browser Same-Origin
Policy prevents container code from reading the host page's DOM, cookies, localStorage, or
session tokens — as long as we don't make architectural mistakes (same-origin iframe, unvalidated
postMessage).

The mandatory COOP headers (`same-origin`) provide additional protection by severing
cross-window references.

Platform-side attack surface that WebContainer does NOT eliminate: prompt injection into the
generation service, LLM vendor trust, publish-time XSS (must put published output on an
independent domain), CDN integrity, account system.

Hard architectural constraint that follows: published app output MUST be served from a separate
domain from the Forge host — otherwise a malicious generated app can reach Forge user sessions.

Full verified brief: `.scratch/forge-mvp/research/browser-untrusted-code-threat-model-verified.md`