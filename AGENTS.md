# AGENTS.md

## 设计原则

- **FP-Core + Imperative Shell**：判定逻辑全部写成纯函数（时间/随机注入参数，单测锁边界），落在 `src/` 领域层；路由/适配器只做 I/O 编排（解析请求 → 调核 → 按结果做效果），不包含分支判定。范例：`src/auth/otp.ts`（核）与 `src/app/api/auth/otp/verify/route.ts`（壳）。

## Shell 与文件编辑

- **禁止 heredoc**（`cat << 'EOF'`、`python3 - << 'PY'` 等一切 `<<` 形式）。写文件或追加内容一律用 `write`/`edit` 工具；确需 shell 处理文本时用单行命令（`sed`、`printf`、`python3 -c`）。历史教训：heredoc 内容曾造成编辑事故与不可审计的文件变更。
