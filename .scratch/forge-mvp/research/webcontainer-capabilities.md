# Research: WebContainer capability boundary — resolves Ticket 01 (`issues/01-webcontainer-capabilities.md`)

## ⚠️ Provenance and validity warning — read before using this brief

**No web research was performed for this brief.** The tools available to this session were file
read, file write, and supervisor contact only. `web_search`, page fetch, and `source_check` were
not available. Therefore:

- **Nothing below was verified against a primary source during this run.** Every external claim
  is recalled model knowledge of the WebContainer docs and API, not a fetched document.
- **No URL below should be read as "I read this page."** URLs are given as *where to verify*,
  not as evidence already collected.
- **My training data ends in early 2025.** Today is 2026-09-12, so the evidence is roughly
  **20 months stale**. For fast-moving items (Node version, Next.js support status, pricing and
  licensing, published limits) staleness is very likely to change the answer.
- Ticket 01 required "PRIMARY sources: official docs, source code, specs" and `source_check` on
  licensing and hard limits. **That requirement is unmet.** This brief is a prior, not a resolution.

Recommended status: keep ticket 01 **open** as `needs-verification`. Sections 1, 5, 7, and 10 are
the ones that must be re-checked live before any code is written against them.

Confidence labels below use a strict scheme:
- **Architectural** — follows from what WebContainer fundamentally is (browser sandbox, no OS
  kernel). Very unlikely to have changed. My own inference where marked.
- **Recalled-stable** — I recall this from the docs and it is a slow-moving property.
- **Recalled-volatile** — I recall this but it is exactly the kind of thing that changes; treat
  as a hypothesis to test.

---

## Summary

WebContainer is a Node.js-compatible runtime that executes entirely inside the browser using
WebAssembly, with a Service Worker intercepting network calls so an in-container dev server can
be previewed. It runs pure-JavaScript tooling (Vite, Express, Fastify) but **cannot execute
native addons**, which rules out `sharp`, `better-sqlite3`, `bcrypt`, and Prisma's native query
engine. Serving it requires COOP + COEP response headers on the embedding page, which is a real
constraint on Forge's own hosting and on every cross-origin asset that page loads.

**Decision answer: yes** — a Vite + React + Tailwind + shadcn/ui app with client routing and
local state is inside WebContainer's supported envelope, on architectural grounds (the whole
stack is pure JS, needs no native binding, and no OS-level syscall). This is the one conclusion
here I would act on without further verification. Two conditions attach: the COOP/COEP hosting
work is mandatory, and the commercial licensing question in Finding 10 must be resolved because
it can block the project regardless of technical fit.

---

## Findings

### 1. Node version and who controls it

**Claim:** The Node-compatible runtime is bundled inside the `@webcontainer/api` package and is
controlled by StackBlitz. There is no documented API for a consumer to pin or select a Node
version; you get what the package version ships. I recall the baseline tracking Node LTS
(18, later 20).

**Where to verify:** `webcontainers.io` docs; `npm view @webcontainer/api versions`; run
`node --version` inside a booted container.

**Support:** Recalled model knowledge. Not verified this run.

**Confidence:** *Recalled-stable* that StackBlitz controls it and it is not pinnable.
*Recalled-volatile*, and 20 months stale, on the specific version number — do not quote a version
in any Forge doc without running `node --version` in a live container first.

**Forge implication:** Generated code should target broadly-supported ES features rather than
version-gated APIs, since the floor can move under us without warning.

---

### 2. `npm install` of arbitrary packages

**Claim:** npm works inside the container and fetches from the real public registry over the
browser's network path. Any package whose runtime content is JavaScript installs and runs.
"Arbitrary" is true only in the pure-JS sense — see Finding 3 for the hard exception.

**Support:** Recalled model knowledge; `npm install` is the canonical first example in the docs
as I recall them.

**Confidence:** *Recalled-stable*.

**Unverified sub-questions:** whether registry access is proxied through StackBlitz
infrastructure by default, whether a private or self-hosted registry can be configured, and
whether install traffic is subject to any rate limit. All three matter for Forge and none are
answered here.

---

### 3. Native addons — sharp, prisma, better-sqlite3, bcrypt

**Claim:** Packages containing compiled native addons cannot execute. WebContainer has no OS
kernel and no ability to load a platform `.node` binary or run an arbitrary ELF executable, so
an install may appear to succeed while the runtime import fails.

| Package | Blocker | Pure-JS / WASM substitute |
|---|---|---|
| `sharp` | libvips native binding | `jimp`, or a WASM codec such as `@squoosh/lib` |
| `better-sqlite3` | native SQLite binding | `sql.js` (SQLite compiled to WASM) |
| `bcrypt` | native C++ binding | `bcryptjs` — near drop-in API |
| `prisma` | ships a Rust query-engine binary | uncertain; see below |

On Prisma specifically: Prisma has been moving toward a WASM/driver-adapter query engine, and
the state of that work is exactly what my stale training data cannot settle. **Treat Prisma in
WebContainer as unknown, not as broken.** It needs a live smoke test before inclusion or
exclusion.

**Support:** Architectural for the general rule (this follows from the execution model, not from
a doc I read). Recalled model knowledge for the specific package list. Researcher inference for
the substitute column — those are my suggestions, not vendor recommendations.

**Confidence:** **Architectural / high** that native addons cannot run. *Recalled-volatile* on
Prisma's current status.

**Forge implication:** This is the single most important constraint for the code generator. The
generation prompt needs an explicit deny-list plus substitution table, because an LLM writing a
"normal" Node app will reach for `bcrypt` and `sharp` by default and the failure will surface as
a confusing runtime error in the visitor's browser.

---

### 4. Dev servers and server processes

**Claim:**
- **Vite dev server** — supported, and to my recollection the most heavily exercised path in
  StackBlitz's own tutorial infrastructure. HMR works; HMR uses a WebSocket, which functions.
- **Express / Fastify** — supported. Both are pure JS. A server listening on a port inside the
  container is reachable for preview because the Service Worker proxies requests to it rather
  than a real OS socket being opened.
- **Next.js** — runs, with caveats I recall being real: `next/image`'s default optimizer path
  pulls in `sharp` (Finding 3), and boot plus install is substantially heavier than Vite. The
  precise state of App Router, server actions, and middleware under WebContainer is
  *volatile* and 20 months stale.

**Support:** Recalled model knowledge. Architectural inference for *why* in-container servers are
previewable (Service Worker interception, not a real socket).

**Confidence:** *Recalled-stable* for Vite, Express, Fastify. *Recalled-volatile* for Next.js.

**Forge implication:** Forge's chosen generation target is Vite, which is the best-supported
path. That is a favourable alignment and worth keeping — switching generated apps to Next.js
would move onto the shakier surface.

---

### 5. Service Worker, SharedArrayBuffer, COOP/COEP, and what that imposes on hosting

**Claim:** WebContainer requires cross-origin isolation on the page that boots it, which in
practice means serving:

```
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

A Service Worker is also central to the design: it intercepts requests so that preview URLs
resolve to the in-container server.

**Why the headers are non-negotiable:** cross-origin isolation is the browser's precondition for
exposing `SharedArrayBuffer`, and the runtime depends on it. This is a browser platform rule, not
a StackBlitz policy, so no vendor change removes it.

**What it imposes on Forge — the part that actually costs time:**
1. Forge's own web app must set both headers on any page embedding a container. Trivial to add in
   Next.js config/middleware or in Fastify.
2. `require-corp` is the expensive half. Every cross-origin subresource on that page must either
   be same-origin, or carry `Cross-Origin-Resource-Policy`, or be CORS-loaded appropriately, or
   be proxied. Third-party fonts, analytics, image CDNs, and embedded widgets commonly do **not**
   send CORP, and they break silently on that page.
3. Because of (2), the pragmatic pattern is to isolate the container on its own dedicated route
   or subdomain and keep the marketing/dashboard pages outside the isolated context, so the whole
   app is not subject to `require-corp`.
4. Service Worker registration requires a secure context: HTTPS, or localhost for development.

**Support:** Architectural / platform rule for the SharedArrayBuffer–COOP/COEP relationship
(verifiable on MDN). Recalled model knowledge that WebContainer requires it. Item 3 is
**researcher inference** — my architectural recommendation, not a documented vendor instruction.

**Confidence:** **High** that the headers are required. High that `require-corp` breaks
non-CORP third-party assets. Medium on browser-support specifics: I recall Safari gating
`SharedArrayBuffer` behind cross-origin isolation from roughly 16.4, but current Safari behaviour
is beyond my data and should be smoke-tested given Forge targets the general public.

**This is the top integration risk in the brief.** It is not hard, but it is the kind of thing
that surfaces late and eats hours of a one-weekend build. Do it early.

---

### 6. Filesystem persistence and zip export

**Claim:** The filesystem is virtual and in-memory. It is seeded from a `FileSystemTree` at mount
time and exposed through an `fs` API on the container instance (`readFile`, `writeFile`,
`readdir`, `mkdir`, and a watch capability). **It does not survive a page reload by itself.**
Persistence is the embedder's job: walk the tree, serialise, store (IndexedDB, or Forge's
backend), and remount on return.

**Zip export:** I do not recall any built-in "export as zip" in the API surface. The workable
route is to read the tree via the `fs` API and build the archive client-side with `fflate` or
`JSZip`.

**Support:** Recalled model knowledge for the in-memory model and `fs` surface. The absence of a
zip export is **recalled absence**, which is weaker evidence than a positive claim — verify
against the current API reference rather than trusting it.

**Confidence:** *Recalled-stable* on in-memory / non-persistent. Medium on the exact `fs` method
list. Low-medium on "no built-in zip" — argued from absence.

**Forge implication:** Snapshot/restore must be built explicitly; it is not free. This also lines
up with a documented pain point in the reference product: `docs/01-atoms-core-features.md`
records that Atoms' Supabase Connect exists partly to solve "数据只存在浏览器内存、刷新即失"
(data lives only in browser memory and is lost on refresh). Same class of problem, and it lands
on Forge too.

---

### 7. Hard limits — memory, file count, file size, bundle size, concurrent instances

**Claim:** I am not aware of a published table of numeric hard limits, and I will not invent one.
Effective limits are browser and device budgets rather than a documented quota.

| Limit asked for | What I can honestly say |
|---|---|
| Memory ceiling | Bounded by the browser tab's WASM memory budget, which varies by browser, OS, and 32/64-bit addressing. **No sourced number.** |
| Max single file size | No documented cap known; bounded by available memory. **Unverified.** |
| Max file count | No documented cap known. **Unverified.** |
| Install / bundle size | Bounded by memory. Large installs are heavy but not categorically blocked. **No sourced threshold.** |
| Concurrent instances per page | I recall the API being designed around a single container instance per page, with booting a second being an error or unsupported. *Recalled-volatile — verify.* |
| Concurrent instances across tabs | Not specified as far as I know. Practically limited by device RAM. **Researcher inference.** |

**Confidence:** **Low** on every number, because there are none. High confidence only in the
meta-claim that these are not publicly specified as hard numbers.

**Forge implication:** Since usage limits are in scope for the destination ("accounts and usage
limits"), and WebContainer publishes no quota to enforce against, Forge's limits have to be
defined empirically — pick a project-size cap from measured behaviour on a mid-range laptop, not
from a spec. Also note that memory pressure lands on the **visitor's** device, so a heavy
generated app degrades their browser, not Forge's servers. That is an argument for a
conservative generated-dependency budget.

---

### 8. What is explicitly not supported

| Capability | Status | Basis |
|---|---|---|
| Native addons / `.node` binaries | Not supported | Architectural |
| Running arbitrary native executables | Not supported | Architectural |
| Docker / nested containers | Not supported — no kernel, no cgroups, no namespaces | Architectural |
| GPU compute (CUDA, ML acceleration) | Not available to Node code | Architectural |
| Raw TCP / UDP sockets | Not supported; traffic is confined to what the browser can do (HTTP/S, WebSocket, and same-origin/CORS rules) | Architectural + recalled |
| Unix domain sockets | Not supported | Architectural |
| `child_process` spawning native binaries | Not supported. Spawning JS processes is a different matter — the API's own `spawn` is how you run `npm`/`node`, so "no child_process" is too blunt a summary | Recalled + architectural |
| Arbitrary outbound network to any host | Constrained by browser security, notably CORS — a fetch from container code is still a browser fetch | Architectural |
| True DNS resolution | Not as an OS resolver would do it | Architectural inference |
| **WebSocket server inside the container** | **Supported** — Vite HMR is itself a WebSocket server and is the standard path | Recalled-stable |
| WebSocket client outbound | Supported, subject to browser rules | Recalled-stable |

**Note on the ticket's phrasing:** the ticket asks "server WebSockets?" as if it might be
unsupported. My recollection is the opposite — it works, and Vite HMR is the existence proof. I
flag this because an early-2020s-era limitation list circulated that said otherwise; if a
reviewer finds such a claim, it is likely stale rather than current.

**The CORS point deserves emphasis** and is easy to miss: code running in WebContainer makes
network calls *as the browser*. A generated app calling a third-party API that lacks permissive
CORS headers will fail in WebContainer even though the identical code would work on a server.
This is a recurring source of confusing failures for generated apps that fetch external data.

---

### 9. Cold boot time and npm install duration

**Claim:** Boot to a usable container is fast — order of a second or two on a modern desktop, with
first visit paying additional cost for fetching the runtime and registering the Service Worker.
`npm install` dominates total time-to-preview and scales with dependency count and network.

I recall StackBlitz operating a package-resolution/caching layer that materially speeds installs
relative to a cold public-registry install.

**Support:** Recalled model knowledge. **I am deliberately not giving a seconds-level table for
install duration** — in my previous draft I produced one, and those numbers were interpolation
presented with false precision. Install time for the exact Forge template must be measured, not
estimated.

**Confidence:** Medium that boot is ~1–2s. Low on install duration. Unverified whether the
acceleration layer applies to a self-hosted embedder or only to stackblitz.com.

**Forge implication:** Time-to-first-preview is a product-critical number for a non-technical
stranger's first impression, and it is currently unmeasured. Measure it early; it may drive a
decision to pre-bake or vendor the template's dependencies.

---

### 10. Licensing — decision-critical and unverified

**Claim:** I recall the WebContainer API being free for personal, educational, and open-source
use, with **commercial use requiring an agreement with StackBlitz**. Forge is a commercial-shaped
product (accounts, usage limits, a public product surface), so this plausibly applies even with
billing out of scope for the MVP.

**Support:** Recalled model knowledge only. The ticket explicitly required `source_check` on
licensing, and `source_check` was unavailable. **This is the weakest-evidence, highest-stakes
item in the brief.**

**Confidence:** Low-medium on the specifics; high that a licensing gate of some kind exists and
must be checked.

**Forge implication:** This can block the strategy independently of every technical finding
above. It should be resolved before the weekend build starts, by reading StackBlitz's current
terms directly and contacting them if ambiguous. A yes/no on technical capability is worth little
if the licence forbids the deployment shape.

---

### 11. Internal contradiction in this repo's own architecture doc

**Claim:** The ticket states the sandbox strategy is already decided as WebContainer, running in
the visitor's browser. `docs/03-architecture.md` in this repo does not reflect that decision. It
specifies a server-side sandbox throughout:

- §3.4 "Build & Sandbox Service" describes per-task Linux containers with gVisor or Firecracker,
  a read-only root FS with a writable `/workspace` overlay, seccomp profiles, and a container pool.
- §5.1 explicitly records the decision as "v1 用 gVisor，池化预热解决冷启动延迟；v2 迁移 Firecracker"
  (v1 uses gVisor, v2 migrates to Firecracker).
- §5.2 exposes previews by reverse-proxying `/preview/{sandboxId}/` to `sandbox_ip:3000`.
- §6.1 builds the security model on host-level namespaces, cgroups, and an egress allowlist.

**Support:** **Direct evidence** — I read `docs/03-architecture.md` in this session. This is the
only direct-evidence finding in the brief.

**Confidence:** High.

**Why it matters:** the WebContainer decision invalidates a large part of §3.4, §5.1, §5.2, and
§6.1, and it relocates the security model. With execution in the visitor's browser, the sandbox
boundary becomes the browser's own, several server-side controls become moot, and the egress
allowlist in §6.1 is not enforceable the same way because network calls originate from the
visitor. Conversely, some §3.4 items still need a home: the terminal log stream and the workspace
snapshot both have to be re-plumbed to a browser-resident container. This should be raised as a
follow-up ticket rather than silently reconciled.

---

## Contradictions

1. **Repo-internal, confirmed:** Ticket premise (WebContainer, visitor browser) versus
   `docs/03-architecture.md` §3.4/§5.1/§5.2/§6.1 (gVisor server-side containers). Direct evidence,
   documented in Finding 11. Not resolved here — flagged for a decision.
2. **Server WebSockets:** older limitation lists suggesting no in-container WebSocket server
   versus Vite HMR working in practice. I lean to "supported and the old claim is stale," but I
   could not fetch either side this run. Recorded rather than resolved.
3. **Prisma:** "native binary, therefore impossible" versus Prisma's WASM/driver-adapter
   direction. Genuinely unsettled by my stale data. Needs a smoke test.
4. **Correction to my own earlier draft:** an earlier version of this file cited specific doc URLs
   as direct evidence and gave an npm-install duration table. Both were unsupported — the pages
   were never fetched and the durations were interpolated. Removed. It also stated my training
   cutoff as May 2026, which was wrong; it is early 2025.

---

## Missing evidence

Everything in this list is a consequence of having no web access this run.

**Blocking before the build starts:**
1. Commercial licensing terms for the WebContainer API (Finding 10). Highest priority.
2. COOP/COEP feasibility against Forge's intended hosting and asset set (Finding 5).

**Needed for correctness of generated apps:**
3. Current Node version in the shipped package (Finding 1).
4. Prisma-in-WebContainer status, if Prisma is a candidate for generated backends (Finding 3).
5. Whether the npm registry path can be pointed at a private or proxied registry, and any rate
   limits on install traffic (Finding 2).

**Needed to set product limits and UX copy:**
6. Any published limits at all — memory, file count, file size (Finding 7). Currently unknown,
   likely unpublished, therefore must be measured.
7. Measured time-to-first-preview for the exact Vite + React + Tailwind + shadcn/ui template
   (Finding 9).
8. Whether StackBlitz's install-acceleration applies to a self-hosted embedder (Finding 9).
9. Current Safari support, since Forge targets the general public (Finding 5).
10. Confirmed single-instance-per-page constraint and cross-tab behaviour (Finding 7).
11. Whether a built-in zip export now exists in the API (Finding 6) — my claim rests on recalled
    absence, the weakest form of evidence here.

---

## Sources

### Consulted this run (direct evidence)
- `docs/03-architecture.md` — read in full. Source of Finding 11 and of the confirmed
  contradiction. Relevant sections: §3.4, §5.1, §5.2, §6.1.
- `docs/01-atoms-core-features.md` — read. Corroborates the in-memory-loss problem class
  (Supabase Connect motivation, §8.2) and records that Atoms' own runtime is server-side
  containerised (§11), i.e. the reference product did not take the WebContainer route.
- `.scratch/forge-mvp/issues/01-webcontainer-capabilities.md` — the ticket.

### Not consulted — the verification queue
These are where the external claims should be checked. **I did not open any of them.**
- `webcontainers.io` — guides and API reference: runtime model, `fs` API, `spawn`, boot,
  documented limitations, required headers, browser support.
- StackBlitz terms / licensing pages — for Finding 10.
- `npm view @webcontainer/api` — package versions and changelog, for Finding 1.
- MDN `SharedArrayBuffer` security requirements, and `Cross-Origin-Embedder-Policy` — the
  platform rule behind Finding 5.
- StackBlitz's public issue tracker / discussions — for Next.js status and Prisma reports.

### Deliberately excluded
- Third-party blog write-ups summarising the official docs. The ticket rules out blog summaries
  in favour of the source that owns the claim.

---

## Next steps

Ordered by what unblocks or endangers the weekend build.

1. **Resolve licensing.** Read StackBlitz's current terms for commercial WebContainer API use.
   Binary risk to the whole strategy; cheap to check.
2. **Boot a container and measure.** One throwaway page with COOP/COEP set: boot, print
   `node --version` and `process.versions`, install the real Forge template, time it, and confirm
   the Vite preview renders with HMR. This single experiment settles Findings 1, 2, 4, 9 and part
   of 7 with direct evidence, and is far more valuable than more reading.
3. **Test COOP/COEP against the real asset list.** Enable `require-corp` on the intended hosting
   and find what breaks. Decide then whether to isolate the container on its own subdomain.
4. **Write the generator's dependency deny-list.** Native-addon packages plus substitutions
   (Finding 3). Cheap, and prevents a whole class of confusing runtime failures.
5. **Raise an architecture-reconciliation ticket** for the Finding 11 contradiction, covering
   where the security model, log streaming, and workspace snapshot now live.
6. **Probe practical limits empirically** on a mid-range laptop to derive Forge's usage limits,
   since no vendor quota appears to exist to enforce against.

---

## Bottom line for the decision this ticket had to unblock

**Can a generated Vite + React + Tailwind + shadcn/ui app with client routing and local state run
in WebContainer? Yes.** Every element of that stack is pure JavaScript, requires no native addon,
and needs no OS-level capability the browser sandbox lacks. This rests on architectural reasoning
about what WebContainer is rather than on a page I fetched today, but it is the kind of claim
where that reasoning is strong, and it is also cheap to confirm with step 2 above.

The risks that remain are not "will the app run." They are: the licensing gate (Finding 10), the
`require-corp` asset work (Finding 5), the absence of any published limits to build usage caps
against (Finding 7), and the fact that this repo's architecture document still describes a
different sandbox entirely (Finding 11).
