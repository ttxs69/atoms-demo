# 02 — 单条消息写入真实沙箱，双栏结构上线

**What to build:** 用户打开 Forge，输入"做一个 hello page"，右侧对话面板里能看到 Alex
的角色标识和正在流出的文字，左侧预览栏在结构上存在（空白占位可以）。
最终沙箱里真的有一个文件，内容是 Alex 写的。

这是第一个从浏览器到 E2B 的**全程打通**：
浏览器 → POST /api/generate → SSE → Orchestrator.run() → Alex → write_file → 真实沙箱。
没有 Emma 规划、没有构建、没有预览 URL——只是这一条路，但是真实的。

双栏布局（左对话、右预览）按 `prototypes/ui-layout.html` 里的 B 方案搭结构框架。
预览区此时空白没关系，10 号票补打磨。

**Blocked by:** 01 — 走通骨架：三个端口、事件契约、测试台

**Status:** done

- [ ] `POST /api/generate` 接受 `{ sessionId, message }` 并返回 `text/event-stream`
- [ ] SSE 流把 `ForgeEvent` 序列化后推到浏览器，浏览器能解析回来
- [ ] Orchestrator 通过真实 E2B Sandbox adapter 创建沙箱（`onTimeout: 'pause'`，`metadata: { workspace_id }`）
- [ ] `write_file` 工具调用后文件真的写进了沙箱
- [ ] 对话面板里能看到 Alex 的角色标识、流式文字和工具调用的文件名
- [ ] 双栏布局存在：左侧对话、右侧预览区（此时空白）
- [ ] E2B SDK 是当前最新版（规避 `connect()` 覆盖 `autoPause` 的 issue #875）
- [ ] 现有的测试仍然是绿的（新的 adapter 代码要有单元覆盖）
