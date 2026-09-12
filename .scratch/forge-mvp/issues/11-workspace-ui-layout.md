# 11 — 对话 + 预览界面布局

Type: prototype
Status: open
Blocked by: 10

## Question

依赖 ticket 10 的范围裁剪结论。用 `/prototype` 产出可比较的布局方案。

待定的决策：

- **整体骨架**：单栏（对话为主，预览弹出）/ 双栏（左对话右预览）/ 三栏？
  Atoms 是三栏（Sidebar + Chat + Preview/Editor/Terminal），
  但那是成熟产品；周末规模下哪一栏可以砍？
- **移动端**：是否需要支持？如果终点要求"陌生人公开访问"，
  很大比例的首次接触发生在手机上——但移动端做生成体验本身就很别扭。
- **预览的位置**：内嵌 iframe 还是新标签页打开？
  WebContainer 在 iframe 里的行为（Service Worker 作用域、COOP/COEP）
  是否有坑？这个需要与 ticket 01 的结论交叉验证。
- **空状态**：新用户第一眼看到什么？有没有引导样例？
- **模式与角色的开关放在哪**（如果 ticket 06/07 决定要暴露给用户）
- 主题：亮/暗/跟随系统？
- **零状态的信任建立**：用户凭什么相信一个陌生网站能生成应用？
  需要多少说明文字是多余的、多少是必要的？

产出至少两个可比较的布局方案（低保真线框即可），链接到本 ticket。

## Answer

<!-- filled on resolution -->
