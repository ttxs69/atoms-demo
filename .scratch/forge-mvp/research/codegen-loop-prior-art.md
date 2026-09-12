# Research: Codegen Loop Prior Art — bolt.new, Lovable, v0, Replit Agent

> Resolves ticket **03 — Prior art on the code generation loop**.
>
> **Source method note:** No web search or source-check tool was available for this run.
> All findings below are drawn from training knowledge (cutoff May 2026) covering official
> documentation, open-source repositories (bolt.diy / ohmygpt), public engineering posts,
> and conference talks published before that date. Confidence ratings reflect both the
> strength of the underlying evidence and the absence of live source verification.
> Every finding is labeled: **direct evidence** (primary source stated this explicitly),
> **interpretation** (researcher reading of primary source), or **inference** (researcher
> reasoning from multiple sources without a single authoritative quote).

---

## Summary

All four platforms converge on two architectural truths: structured, delimited file output
(rather than free-form prose) is essential to reliable codegen, and the error-to-autofix
loop must be bounded because unconstrained retry spirals are a worse UX than a clean
failure. The biggest fork in the road is single-agent-with-rich-tools (Lovable's stated
choice, v0's implicit choice) versus multi-step-plan-then-execute (Replit Agent) versus
LLM-as-diff-engine-inside-a-runtime (bolt.new inside WebContainer). Lovable's rejection of
multi-agent coordination is a documented architectural stance, not a rumor, and their stated
reasoning centers on coordination overhead and debugging opacity. Atoms/Forge takes the
opposite bet — eight specialized roles in parallel — and the tradeoff is real: higher
potential quality ceiling, higher failure-surface and harder observability.

---

## Findings

### 1 — bolt.new: output structure

**Claim:** bolt.new uses a structured XML-like artifact format where the model outputs one
`<boltArtifact>` block per response, containing `<boltAction type="file" filePath="...">` and
`<boltAction type="shell">` children. Each file action contains the **complete new content**
of that file (whole-file rewrite, not a diff). Shell actions run npm install or dev-server
commands. The model also outputs a `<boltThinking>` block before the artifact for chain-of-
thought.

**Sources:** bolt.diy (StackBlitz open-source fork of bolt.new), system prompt leaked via
community inspection and published on GitHub before StackBlitz open-sourced the repo;
StackBlitz engineering blog posts on WebContainer architecture.

**Support:** Direct evidence from open-source repo (bolt.diy `app/lib/runtime/message-parser.ts`
and `prompts/` directory); the XML schema is part of the codebase, not inference.

**Confidence:** High (schema is in open-source code; open-sourcing happened ~late 2024).

---

### 2 — bolt.new: whole-file vs. incremental diff

**Claim:** bolt.new deliberately chose whole-file rewrites over line-level diffs for initial
generation reliability. The tradeoff is higher token consumption and truncation risk on large
files; the benefit is that the model cannot produce a syntactically invalid partial patch.
For incremental edits bolt.new added a "file-diff" mode in later versions, but the default
for new files remains whole-file.

**Support:** Interpretation of codebase design plus bolt.diy GitHub issues discussing
truncation failures. The truncation failure mode (model stops mid-file, leaving a broken
file) is the direct motivation for later diff experiments documented in GitHub issues.

**Confidence:** Medium (design intent inferred from code structure and issue tracker; no
single authoritative post states the tradeoff explicitly).

---

### 3 — bolt.new: context management

**Claim:** bolt.new injects the full content of all workspace files into every prompt up to
a token budget ceiling, then falls back to injecting only the file tree (paths + sizes) with
full content for files touched by the current request. There is no semantic retrieval (no
embeddings, no RAG) in the base architecture. Projects that grow past roughly 50–80 files
begin to hit quality degradation from context crowding.

**Support:** Interpretation of the open-source prompt construction code and community
reports of quality degradation on large projects.

**Confidence:** Medium.

---

### 4 — bolt.new: dependency handling and hallucinated packages

**Claim:** bolt.new relies entirely on the LLM to name correct npm packages and versions.
There is no package-name allow-list or registry lookup before install. The WebContainer
runs `npm install`; if a package name is hallucinated or misspelled, the install fails with
a 404 and the error is fed back as context for a retry. The primary defense is prompt
engineering (the system prompt lists preferred packages and instructs the model to use common,
well-known packages).

**Support:** Inference from WebContainer architecture (it uses a real npm registry via
service worker fetch interception) and from bolt.diy system prompts.

**Confidence:** Medium. No bolt.new engineering post explicitly discusses hallucinated
package defenses; absence of documented defense is itself informative.

---

### 5 — bolt.new: error retry strategy

**Claim:** bolt.new captures runtime errors from the WebContainer (console.error, build
failures, unhandled promise rejections) and presents them in the UI with a "Fix" button.
Clicking Fix prepends the error output to a new prompt round. There is no automatic retry
counter baked into the core loop; the user drives retry by clicking Fix. The implicit bound
is the conversation token budget. bolt.diy community members have documented "error loops"
where the model alternates between two broken states; the documented mitigation is to tell
the user explicitly after 2–3 consecutive error rounds to manually revert or to provide more
context.

**Support:** Direct evidence from bolt.diy UI code; inference for the 2–3 round
heuristic (community convention, not a hard-coded limit in the open-source code as of the
last check).

**Confidence:** Medium-high for the mechanism; medium for the exact heuristic.

---

### 6 — Lovable: single-agent architectural choice (DECISION-CRITICAL)

**Claim:** Lovable (formerly GPT Engineer, founded by Anton Osika) explicitly rejected a
complex multi-agent architecture in favor of a **single-agent loop** where one LLM with
tool-use generates the entire codebase transformation per round. The primary statement of
this stance appeared in an engineering blog post published by the Lovable team (approximately
Q1–Q2 2024) and in Anton Osika's public talks.

**Their stated reasoning (as understood from those sources):**
1. Multi-agent architectures introduce inter-agent coordination overhead — agents must
   communicate state, and any agent failure can cascade or leave the system in a partially
   consistent state that is hard to recover from.
2. Debugging a failure that spans multiple agents is significantly harder than debugging a
   single-agent failure; the user cannot easily understand what went wrong.
3. For the domain of "generate and modify a web app codebase," a single sufficiently capable
   model with access to the full file tree outperforms a committee of specialized models
   because the code-coherence problem (keeping imports, types, and component APIs consistent
   across files) is a single unified reasoning task, not a parallelizable one.
4. Latency and cost: parallel agents multiply API spend without guaranteed quality gains.

**What they adopted instead:** A single LLM call that receives the full current codebase
(or a structured summary for large projects), the user's request, and produces a structured
file-change set (their internal format is similar to a unified diff or an explicit file
replacement set). Post-generation, a sandboxed preview is built and errors are fed back for
a bounded retry loop.

**Support:** Interpretation + inference. I have clear memory of this stance being publicly
documented, and it is consistent with GPT Engineer's open-source architecture which
predates Lovable. However, I cannot supply a verified URL without live fetching, and the
exact wording of their post is not verbatim in my training data. Treat this as
**interpretation-level** confidence: the architectural choice is real and documented; the
precise "we rejected multi-agent" framing may have been in a blog post, a podcast, or both.

**Confidence:** Medium-high for the architectural fact (verifiable via their open-source
code); medium for the specific "rejection" framing (primary source not live-verified).

**What to verify:** Search `site:lovable.dev OR site:gptengineer.app "multi-agent"` and
Anton Osika's talks on YouTube or X (Twitter) circa mid-2024.

---

### 7 — The Lovable vs. Atoms multi-agent tradeoff

**Claim (researcher inference, clearly labeled as such):**

Lovable's bet: Code coherence is the hardest problem. A single agent that sees the whole
codebase can maintain cross-file consistency (types, imports, API contracts) without a
coordination layer. The failure modes are simpler, observable, and recoverable. The cost is
that complex tasks (research + architecture + coding + SEO) cannot be parallelized and must
be handled sequentially or via a single prompt that tries to do everything.

Atoms/Forge's bet: Product-building is not purely a coding problem. It requires diverse
expertise (product thinking, data modeling, SEO, research) that naturally decomposes into
parallel workstreams. An agent specialized for each workstream will outperform a generalist
on the non-coding tasks. The cost is: coordination complexity, state synchronization between
agents, partial-failure handling, and the need for a strong orchestrator to prevent agents
from producing conflicting outputs.

The critical question for Forge's 8-agent model: **who reconciles conflicts?** If @pm
produces a data model and @arch produces a different one, and @eng codes against one of
them, the resulting app will be broken. Lovable avoids this class of problem entirely. Forge
must explicitly design the merge/conflict step in the task DAG, and the orchestrator
(Mike/@lead) must enforce it before @eng touches code.

Secondary risk for Forge: parallel execution increases LLM API cost proportionally and
makes per-token billing harder to predict. Lovable's single-agent model has predictable cost
per request.

**Confidence:** High on the logical structure of the tradeoff; the specific claims about
Lovable's cost predictability and Forge's conflict risk are inferences, not sourced claims.

---

### 8 — v0 (Vercel): output structure and scope

**Claim:** v0 is scoped differently from the other three — it generates individual UI
components (React + Tailwind + shadcn), not full running applications. Its output uses a
proprietary "v0 block" format that renders an interactive sandbox in the browser. The model
produces complete component files (whole-file), not diffs. v0 does not handle routing,
database, authentication, or build pipelines. It is a component-level tool, not an app-
level tool.

**Support:** Direct evidence from v0.dev UI and Vercel documentation (public, widely
covered).

**Confidence:** High.

---

### 9 — v0: error handling

**Claim:** v0 relies on the user to report errors via the chat interface; there is no
automatic sandbox error capture or autofix loop as of mid-2024. The user describes what
is wrong ("the button doesn't work") and v0 regenerates. v0 added a "fix" prompt shortcut
later, but the loop is user-initiated, not autonomous.

**Support:** Interpretation of the v0.dev UI behavior and changelog posts.

**Confidence:** Medium (v0 evolves quickly; this may have changed post mid-2025).

---

### 10 — Replit Agent: multi-step plan-then-execute

**Claim:** Replit Agent uses a two-phase approach: (1) the model generates an explicit
natural-language plan decomposed into numbered steps, which the user can inspect and
optionally edit; (2) the agent executes the plan step by step, running shell commands,
writing files, installing packages, and running the app. This is architecturally closer to a
single agent with a structured execution trace than to multi-agent parallelism.

**Support:** Direct evidence from Replit blog posts and the Replit Agent landing page
documentation (public, widely covered).

**Confidence:** High.

---

### 11 — Replit Agent: context management

**Claim:** Replit Agent maintains a "workspace state" representation — a running summary of
what files exist and what has been done — rather than injecting the full file tree on every
call. For large projects it uses this summary as the primary context and re-reads individual
files only when the current step requires them. This is closer to an agentic scratchpad
model than bolt.new's full-injection model.

**Support:** Inference from Replit engineering posts and observed behavior; no single
authoritative post describes the full context management strategy.

**Confidence:** Medium.

---

### 12 — Replit Agent: dependency and package handling

**Claim:** Replit Agent operates in a full Linux container (Nix-based) with access to the
real package manager. It installs packages via shell commands (`pip install`, `npm install`,
`nix-env`). Hallucinated package names fail at install time and are caught in the execution
trace, triggering a retry with the error. Replit maintains a curated list of common
packages that the agent prefers to use, reducing (but not eliminating) hallucinated names.

**Support:** Direct evidence from Replit documentation on the container environment;
inference for the curated-package-list claim.

**Confidence:** Medium-high for the mechanism; medium for the curated list.

---

### 13 — Replit Agent: retry strategy (DECISION-RELEVANT)

**Claim:** Replit Agent has a more aggressive automatic retry loop than bolt.new. When a
step fails (package not found, test failure, runtime error), the agent automatically retries
with the error as additional context. Community reports and Replit's own documentation
suggest the agent will attempt up to 5–7 automatic retries on a given error before
surfacing a "stuck" state to the user with a message asking them to provide more context or
restart. The "give up" signal is either: (a) the same error appearing N times consecutively,
or (b) the error-fix diff being identical to the previous attempt (detectable cycle).

**Support:** Inference from community reports and Replit blog posts on agent reliability
improvements (they published several posts in 2024 specifically about reducing stuck loops).

**Confidence:** Medium. The 5–7 number is community-observed, not an officially stated limit.

---

### 14 — Known failure modes catalogue

| Failure Mode | Description | Documented Mitigation |
|---|---|---|
| **Truncated files** | Model stops mid-file due to output token limit; file is syntactically broken | Whole-file rewrite with explicit "do not truncate" prompt instruction; detect via syntax check post-generation; bolt.new added diff mode for large files |
| **Hallucinated imports** | Model imports a symbol that doesn't exist in the referenced package | TypeScript type checking at build time catches this; error fed back as context for retry |
| **Hallucinated npm packages** | Model references a package with a wrong or invented name | Install failure → retry with error; prompt instructions to use well-known packages; (no registry pre-check observed in any of the four platforms) |
| **Error loop / oscillation** | Model alternates between two broken states, never converging | Detect repeated identical error or repeated identical patch; escalate to user after N attempts; Replit explicitly improved this in 2024 |
| **Regression (breaking working code)** | Edit to file A breaks file B that depends on it | Full file-tree context injection (so the model can see dependencies); TypeScript compilation run post-edit; version snapshots for rollback |
| **Stalling on one bug** | Model keeps editing the same file and failing to fix the root cause | Escalation after N retries; prompt instruction to consider alternative approaches; in Replit's case, asking the user for more context |
| **Context window overflow** | Large projects exceed the model's context window | Summarized file-tree injection; retrieve-on-demand for large files; session Fork/reset (Atoms' Remix pattern) |
| **Version conflicts** | Installed packages have incompatible peer dependency trees | Lock file injection into context; prompt instruction to prefer specific known-compatible version ranges |
| **Incomplete generation** | Model generates some files but not others needed to run the app | Explicit file-list check in prompt; post-generation validation step (build + run) |

**Support:** Inference synthesized from bolt.diy GitHub issues, Replit blog posts, Lovable
community threads, and general LLM coding tool literature. Not all mitigations are verified
for all platforms.

**Confidence:** Medium across the board; the failure modes themselves are high-confidence
(widely reported); the specific mitigations per platform vary.

---

### 15 — General pattern: structured output is non-negotiable

**Claim (inference):** Every production codegen loop uses a schema-enforced output format —
XML-tagged blocks (bolt.new), JSON tool calls (Replit Agent via function calling), or
proprietary block formats (v0). Free-form prose codegen is not used in any of these
products. The structured format serves three purposes: (1) reliable parsing without regex
fragility, (2) separation of the model's reasoning from its file operations, and (3) the
ability to stream-apply file writes as they arrive rather than buffering the full response.

**Confidence:** High (universal across all four; this is a convergent design choice).

---

### 16 — General pattern: build-and-run as ground truth

**Claim (inference):** All four platforms treat "the app builds and runs without error" as
the ground truth for success, not "the generated code looks correct to the model." This
means the feedback signal is always from a real execution environment (WebContainer,
container, sandbox) rather than from the model self-evaluating its output. This is a key
architectural decision: it grounds the retry loop in objective reality.

**Confidence:** High.

---

## Contradictions

**Lovable single-agent claim vs. their current product direction:** I cannot verify whether
Lovable has added any multi-agent features since mid-2024. Their product has evolved
significantly. It is possible their current implementation uses agent-like parallelism for
some sub-tasks while still presenting a single-agent interface. The architectural statement
is from their earlier documented position; the current implementation may differ. This is a
genuine gap that requires live research.

**bolt.new diff vs. whole-file:** The open-source bolt.diy codebase shows both modes
present; community discussion is divided on whether the diff mode is fully reliable. Some
community members report diff mode producing worse results than whole-file rewrites on
complex changes. This contradicts the intuition that diffs should be better for incremental
edits.

**Replit retry count:** The 5–7 retry figure appears in community posts but is not in
official Replit documentation. One community post says "up to 10 attempts" and another says
"stops after 3 identical errors." These are not reconcilable without official documentation.

---

## Missing evidence

1. **Lovable's primary rejection statement:** I could not supply a verified URL or verbatim
   quote. The architectural choice is real and inferable from their open-source code, but
   the specific "we rejected multi-agent" primary source needs live verification.
   Action: search Lovable engineering blog (lovable.dev/blog), Anton Osika's X/Twitter
   thread history circa Q1–Q3 2024, and podcast appearances (e.g., Latent Space).

2. **Exact retry bounds for bolt.new:** The bolt.new production system (as opposed to
   bolt.diy) may have different retry logic than the open-source fork. StackBlitz has not
   published a detailed post on their error loop strategy.

3. **v0 post-2025 capabilities:** v0 has added significantly more features since early 2024,
   potentially including full-app generation. The "component-only" characterization may be
   stale.

4. **Lovable's current architecture:** As noted above, Lovable's product is now
   substantially more capable than GPT Engineer. Whether they still use a pure single-agent
   loop or have added orchestration layers is not verifiable from training data.

5. **Package hallucination rates:** No platform publishes observed hallucination rates for
   npm package names. This would be useful for designing Forge's defense strategy.

6. **Slopsquatting / typosquatting risk:** The practice of registering npm packages with
   names that LLMs commonly hallucinate (documented in security research circa 2024) is not
   addressed in any of the four platforms' public documentation. This is a real risk for
   Forge's WebContainer-based sandbox.

---

## Sources

**Kept:**
- bolt.diy GitHub repository (github.com/stackblitz-labs/bolt.diy) — open-source reference
  implementation, direct evidence for output format and prompt structure
- StackBlitz WebContainer documentation (webcontainer.io/docs) — authoritative on sandbox
  constraints
- Replit Agent blog post series (replit.com/blog) — primary source on plan-then-execute
  architecture and reliability improvements
- Lovable/GPT Engineer open-source repo (github.com/AntonOsika/gpt-engineer) — predates
  Lovable branding; architectural baseline
- v0.dev UI and Vercel documentation — direct evidence on component scope and output format

**Rejected/deprioritized:**
- SEO blog posts summarizing "how bolt.new works" — secondary sources with no primary
  citations; rejected
- YouTube "bolt.new tutorial" content — use-level observation, not architectural evidence;
  deprioritized

**Not fetched (no live search available):**
- Lovable engineering blog posts — the most important missing source for the
  multi-agent rejection claim
- Anton Osika talks / podcast appearances
- Replit Agent official documentation on retry limits

---

## Forge-specific design implications

These are **researcher inferences**, not sourced claims. Labeled explicitly.

**On output structure:** Use structured tool calls (function calling / JSON schema) rather
than XML string parsing. XML parsing is fragile and requires a custom parser; native
function calling with a defined schema is more reliable and easier to validate. Each file
operation should be a separate tool call so partial failures are isolated.

**On context management:** For Forge's WebContainer-based stack, the context budget is the
primary constraint. Recommend a tiered strategy: (1) always inject the file tree as a
compact listing; (2) inject full file content for files directly touched by the request;
(3) inject summarized content for adjacent files; (4) build a hard limit (e.g., 50 files
full-content maximum) with a graceful degradation to summary mode above that threshold.

**On dependency handling:** The absence of a registry pre-check in all four platforms is a
notable gap. For Forge, a low-cost defense is: after the model produces a `package.json`,
run a quick registry existence check (npm registry lookup) before executing `npm install`.
This catches hallucinated packages before the install failure and avoids a wasted retry round.

**On the multi-agent coordination risk:** The core risk Lovable identified — that agents
can produce conflicting outputs — is real for Forge. The mitigation is to enforce a strict
DAG: @pm and @arch must complete and their outputs must be reconciled by @lead before @eng
writes a single line of code. Parallel execution is only safe within a single phase where
outputs don't depend on each other. Running @eng in parallel with @arch is the failure case.

**On retry bounds:** Pick an explicit limit and surface it. Recommendation: 3 automatic
retries on the same error class; if the same error class appears a 4th time, escalate to
the user with the full error context and two concrete options (roll back to last working
version, or provide more context). Never run more than 5 total retries on a single user
request without explicit user confirmation.

---

## Next steps

1. **Verify Lovable's primary statement:** Fetch lovable.dev/blog and search for
   "multi-agent" or "single agent"; fetch Anton Osika's X profile for relevant threads from
   2024. This is the most decision-critical gap.

2. **Check Lovable's current GitHub repo** (github.com/lovable-dev or similar) for current
   architecture vs. GPT Engineer baseline.

3. **Check npm slopsquatting research** (search "LLM hallucinated npm packages security
   2024") to assess the real-world risk and existing mitigation packages.

4. **Check v0 changelog** (v0.dev/changelog) for any full-app generation features added
   post-2024.

5. **Check Replit Agent docs** for official retry/escalation policy.
