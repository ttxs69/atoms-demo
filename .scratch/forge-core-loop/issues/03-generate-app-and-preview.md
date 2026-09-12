# 03 — 生成可跑应用并预览

**What to build:** "做一个心情记录应用"产出多个文件，装依赖，构建，启动开发服务器，
预览 iframe 里出现能点能用的应用。这是第一个真正值得炫耀的时刻。

用户描述想要的东西，等一会儿，然后看到一个真正在跑的应用出现在右侧。
Alex 产出 `package.json`、若干 TypeScript 文件、完成 `npm install`、构建通过，
`getHost(3000)` 的 URL 装进 iframe。用户能在预览里点按钮、填表单。

视口切换（桌面 / 平板 / 手机）在这张票上线。

**Blocked by:** 02 — 单条消息写入真实沙箱，双栏结构上线

**Status:** done

- [ ] Alex 能产出多文件（至少 `package.json` + 入口 + 主组件），写入沙箱
- [ ] `npm install` 在沙箱里执行，对话面板里有进度可见
- [ ] 构建命令（`npm run build` 或 `vite build`）执行成功
- [ ] 开发服务器启动，`getHost(3000)` 返回有效 URL
- [ ] 预览 iframe 加载该 URL，用户能与应用交互
- [ ] 桌面 / 平板 / 手机三种视口可切换（改变 iframe 的容器宽度）
- [ ] 沙箱在生成结束后暂停（`onTimeout: 'pause'`，不等用户离开才暂停）
- [ ] 技术栈：Vite + React + TypeScript + Tailwind（按 `CONTEXT.md` 的技术栈基线）
