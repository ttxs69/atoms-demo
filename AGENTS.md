# AGENTS.md

## Shell 与文件编辑

- **禁止 heredoc**（`cat << 'EOF'`、`python3 - << 'PY'` 等一切 `<<` 形式）。写文件或追加内容一律用 `write`/`edit` 工具；确需 shell 处理文本时用单行命令（`sed`、`printf`、`python3 -c`）。历史教训：heredoc 内容曾造成编辑事故与不可审计的文件变更。
