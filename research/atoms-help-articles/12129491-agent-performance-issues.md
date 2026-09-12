# Agent Performance Issues

- Source: https://help.atoms.dev/en/articles/12129491-agent-performance-issues
- Summary: Guide on resolving agent execution issues, finding output files, and avoiding repeated requests
- Updated: Jul 29, 2026

---

Troubleshoot agent performance issues, output file locations, and repeated execution requests.

## What to Do If Agents Fail to Realize Your Ideas

Like human colleagues, you can give feedback, share ideas, or clarify requirements anytime. The agent team will keep improving based on your guidance until the results meet your expectations.

---

## How to View David's Output Files

You can find David's output files directly in the editor block. If they are not visible in the preview, check the related project folder inside the **Global Folder** located at the top-left corner of the interface.

---

## Reminding Agents Not to Ignore Uploaded Files

When sending requests, explicitly instruct Atoms to inspect your uploaded files before making changes.  
*Example prompt*: `@Alex, please review my uploaded file #/workspace/schema.json and perform the appropriate refactoring.`

---

## Why Atoms Executes the Same Request Repeatedly

If an agent seems to repeat an operation, first determine the reason:

1. **Normal Internal SOP**: If the repetition is part of the agent's internal process to organize, verify, or refine its answer, allow it to complete.
2. **Infinite Loop / Stale Context**: If the agent repeats an action without making progress, click **Stop**, rewrite your prompt with clearer instructions, and point out the specific issue.
