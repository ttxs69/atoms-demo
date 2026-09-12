# 10 — 导出 zip

**What to build:** 一键下载，拿到一个**能直接跑起来的完整项目**——不是一堆散装源文件。

用户下载之后应该能解压、`npm install`、`npm run dev`，看到和预览里一样的东西。
这是"我的东西我能带走"这个承诺的兑现，也是不做发布（ticket 10 砍掉）之后
用户唯一的成果出口。

**Blocked by:** 03 — 生成可跑应用并预览

**Status:** ready-for-agent

- [ ] 界面上有明确的导出入口
- [ ] 从沙箱文件系统打包，浏览器触发下载
- [ ] 产物包含 `package.json`、配置文件、全部源文件——解压后 `npm install && npm run dev` 能跑
- [ ] **不包含** `node_modules`（体积）
- [ ] zip 文件名可辨识（含 workspace 标识或应用名，不是 `download.zip`）
- [ ] 沙箱处于暂停状态时能先恢复再打包（用户可能隔天回来导出）
