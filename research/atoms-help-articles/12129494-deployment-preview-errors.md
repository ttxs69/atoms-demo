# 12129494-deployment-preview-errors

- Source: https://help.atoms.dev/en/articles/12129494-deployment-preview-errors
- Summary: 
- Updated: 

---

Troubleshoot common deployment and preview issues when building web applications with your AI agent team.

## Why Does the Website Only Display "Hello World"?

When your deployed website or preview panel only displays a generic "Hello World" placeholder page, it means the generated code files were not written to the designated workspace path.

### How to Fix

1. Use **`#`** in the prompt box to refer to your project workspace directory.
2. Explicitly instruct your agents to write the build code into the correct workspace path (e.g. `workspace/project_name`).
3. Have your engineer agent verify that `index.html` and entry files are generated in the root of the active workspace.
