# Research: Supabase integration patterns for per-user generated apps

Resolves TICKET 04 (`.scratch/forge-mvp/issues/04-supabase-per-user-apps.md`) — which Supabase patterns officially exist for giving *generated* apps a database + auth, and which has least friction for an anonymous visitor.

---

## ⚠️ Verification limitation — read first

**No web research tool was available in this run.** The runtime registered only file read/write and
supervisor contact for this agent; `web_search` and `source_check` were not callable. The ticket asks for
primary-source verification and `source_check` on decision-critical claims (licensing/pricing, security,
hard limits). **I could not perform either.**

Consequences, stated plainly:

- Every factual claim below is **researcher recall of Supabase documentation, not fetched evidence.**
  I have labelled each one `recall (UNVERIFIED)` and given the canonical URL that owns the claim so a
  follow-up run can verify in minutes.
- My knowledge predates today's date (2026-09-12). The three items most likely to have **changed** and
  most likely to change the answer are: (a) the API-key model (legacy `anon`/`service_role` JWTs vs the
  newer `sb_publishable_*` / `sb_secret_*` keys), (b) free-plan project count and auto-pause window,
  (c) the exact OAuth scope string list. Treat all three as stale until re-checked.
- **Do not ship pricing, quota, or security-boundary decisions on this brief alone.** The architectural
  reasoning (which pattern fits an anonymous visitor) is robust to the details; the numbers are not.

Nothing below should be quoted to a stakeholder as "Supabase documents X" until re-verified.

---

## Summary

Supabase officially supports two relevant patterns: (1) an **OAuth2 "Supabase Integration"** where a
third-party platform acts on a user's own project via the Management API — this is the pattern Atoms
implements, and authorization is granted **per organization**, which is the mechanic behind Atoms'
"organization has been bound by another user" message; and (2) **one project with Row Level Security**
as the officially recommended tenant-isolation mechanism, where exposing the anon/publishable key in
browser code is the intended design and RLS is indeed the enforcement boundary. For a stranger who wants
an app *instantly with no signup*, both per-user-project patterns are disqualified — OAuth needs a
Supabase account and org, and Management API project creation needs a token we cannot obtain for a
visitor plus multi-minute provisioning against a 2-project free quota. **Least friction is a
Forge-owned shared Supabase project with schema- or `tenant_id`-scoped RLS, keys minted by us, with
"bring your own Supabase via OAuth" as a later upgrade path.**

---

## Findings

### 1. OAuth on behalf of a user — the mechanism exists and is first-party

1. **Claim:** Supabase documents a first-party OAuth2 flow for third-party platforms acting on a user's
   Supabase account, published as an integration guide (register an OAuth app under an organization's
   settings, then run authorization-code flow against `api.supabase.com`). The resulting access token is
   used as a bearer token against the **Management API** — i.e. the OAuth flow does not give you a
   separate API surface, it gives you delegated access to the same Management API a personal access
   token reaches.
   **Sources (to verify):** `https://supabase.com/docs/guides/integrations/build-a-supabase-integration`,
   `https://supabase.com/docs/reference/api/introduction`.
   **Support:** recall (UNVERIFIED). **Confidence:** high on existence and shape, medium on endpoint paths.

2. **Claim:** The flow is authorization-code with `client_id` / `client_secret`, an authorize endpoint
   under `https://api.supabase.com/v1/oauth/authorize` and a token endpoint under
   `https://api.supabase.com/v1/oauth/token`, with refresh tokens issued alongside short-lived access
   tokens (my recollection is access tokens on the order of a day, with rotating single-use refresh
   tokens).
   **Sources (to verify):** same integration guide.
   **Support:** recall (UNVERIFIED). **Confidence:** medium on paths, **low on the exact TTL and on
   whether refresh tokens are single-use.** Token lifetime materially affects whether Forge must store
   and rotate refresh tokens in the Secret Vault — verify before implementing.

3. **Claim:** Consent is scoped **to one organization**: the authorizing user picks which Supabase
   organization to grant the integration access to, and the grant covers projects in that organization.
   **Support:** recall (UNVERIFIED) — this is the part I am most confident about structurally, because it
   is what makes Atoms' UX ("pick organization → Authorize → pick or create project") necessary. **Confidence:** medium-high.
   **Researcher inference (clearly labelled):** Atoms' `organization has been bound by another user`
   error is best explained as an *Atoms-side* uniqueness constraint (one Supabase org ↦ one Atoms
   account) rather than a Supabase-imposed 1:1 restriction. I did **not** find, and could not check for,
   any Supabase statement that an organization may only ever authorize one installation of a given OAuth
   app. **Do not record "Supabase forces 1:1" as fact.** See Missing evidence.

4. **Claim:** Scopes are expressed as resource + access level pairs across roughly these resource
   families: Auth, Database, Domains, Edge Functions, Environment, Organizations, Projects, REST,
   Secrets, Storage — each available as read and/or write (e.g. `database:write`, `auth:read`,
   `projects:write`).
   **Sources (to verify):** the scope table in the integration guide.
   **Support:** recall (UNVERIFIED). **Confidence:** medium on the resource families, **low on exact
   scope token spelling.** Anything code-generating against these strings must read the live table.

5. **Claim:** With write scopes, a platform can do what Atoms is observed to do: list organizations and
   projects, create a project, read and modify database schema, and manage Auth configuration.
   **Support:** recall (UNVERIFIED) + inference from the Management API surface. **Confidence:** medium.
   **Two important nuances I could not verify:**
   - *Arbitrary SQL:* there is a Management API endpoint for running a query against a project's
     database (`POST /v1/projects/{ref}/database/query`, to my recollection marked beta/undocumented at
     times, and used by Supabase's own MCP server). Whether it is officially documented **today** and
     whether it is reachable with an OAuth token rather than only a personal access token is
     decision-critical for "agent creates tables" and is **unverified.**
   - *Managing Auth **users** (not Auth settings):* Auth user CRUD is normally the Admin API on the
     project (`/auth/v1/admin/*`) authenticated with the project's **secret/service-role key**, which is
     a different credential from the Management API token. Whether an OAuth-scoped Management token can
     retrieve that project key (thereby transitively granting Auth-user management) is **unverified** and
     is exactly the kind of privilege-escalation edge Forge should not assume.

6. **Claim:** Atoms' documented flow (pick organization → Authorize → pick or create project →
   auto-introspect tables and RLS) is consistent with this pattern end-to-end; schema/RLS introspection
   needs no special feature, it is reading `pg_catalog` / `information_schema` and `pg_policies` through
   whatever SQL path the integration has.
   **Support:** interpretation of `docs/01-atoms-core-features.md` against recalled Supabase capability.
   **Confidence:** medium-high on "consistent", low on "identical mechanism" — Atoms may use the
   query endpoint, or connect over Postgres wire protocol with credentials it obtained, and the
   observable UX is the same either way.

### 2. One shared project + RLS multi-tenancy

7. **Claim:** Row Level Security is Supabase's officially recommended isolation mechanism for data
   belonging to different users inside one project. The documented pattern is: enable RLS on every table
   in an exposed schema, and write policies against the JWT of the requesting user, canonically
   `auth.uid()` (with `auth.jwt()` for custom claims). Supabase documentation is explicit that tables in
   exposed schemas without RLS are readable by anyone holding the anon/publishable key.
   **Sources (to verify):** `https://supabase.com/docs/guides/database/postgres/row-level-security`,
   `https://supabase.com/docs/guides/api/securing-your-api`.
   **Support:** recall (UNVERIFIED). **Confidence:** high on substance — this is the most stable and most
   repeated claim in Supabase's docs.

8. **Claim:** For B2B-style tenancy Supabase documents custom claims / RBAC via a custom access token
   hook, so a `tenant_id`-style claim can be embedded in the JWT and used in policies.
   **Sources (to verify):** `https://supabase.com/docs/guides/database/postgres/custom-claims-and-role-based-access-control-rbac`.
   **Support:** recall (UNVERIFIED). **Confidence:** medium.

9. **Claim (researcher inference, not sourced):** For Forge, "shared project" has two sub-variants with
   very different risk profiles:
   - **Shared tables + `tenant_id` column + RLS** — cheap, but every generated app's data lives in the
     same tables, and *a single wrong or missing policy leaks across tenants.* Since the schema is
     authored by an LLM, this is the dominant risk in the whole ticket.
   - **Schema-per-generated-app** (`app_<id>` schema, one Postgres role per app, policies still on) —
     stronger blast-radius containment, more moving parts, and hits Postgres object limits far later than
     it hits our weekend budget.
   **Confidence:** this is design judgment, not a Supabase claim. I am not aware of an official Supabase
   guide endorsing schema-per-tenant for this use case and could not check.

### 3. Management API — programmatic projects and organizations

10. **Claim:** Projects can be created programmatically: `POST /v1/projects` with organization id, name,
    database password, and region. Provisioning is **asynchronous and takes minutes**, not seconds; the
    project reports a status you must poll until healthy.
    **Sources (to verify):** `https://supabase.com/docs/reference/api/v1-create-a-project`.
    **Support:** recall (UNVERIFIED). **Confidence:** medium-high on existence, medium on required fields,
    **medium-low on "minutes"** — but any provisioning latency above a few seconds already breaks the
    "instant preview" promise, so the exact number is not decision-changing.

11. **Claim:** Organization creation (`POST /v1/organizations`) exists in the API reference.
    **Support:** recall (UNVERIFIED). **Confidence:** low. I specifically cannot verify whether it is
    generally available, whether OAuth tokens may call it, or whether it is restricted to avoid free-tier
    farming. **Treat "Forge can mint an org per visitor" as unproven, and assume it is not permitted**
    until someone reads the reference — programmatically creating orgs to multiply free projects is the
    kind of thing providers restrict, and building on it would be a business risk as well as a technical one.

12. **Claim:** Management API access requires either a **personal access token** (`sbp_…`, created in
    Supabase account settings, carrying that human's full privileges) or an **OAuth access token** from
    an approved integration, sent as `Authorization: Bearer`. There is a documented global rate limit on
    the Management API; my recollection is **60 requests per minute per user**.
    **Sources (to verify):** `https://supabase.com/docs/reference/api/introduction`,
    `https://supabase.com/docs/guides/platform/rate-limits` (or the "Limits" page).
    **Support:** recall (UNVERIFIED). **Confidence:** medium on the mechanism, **low-medium on the exact
    60/min figure.** Note the privilege asymmetry: a personal access token is *account-wide and
    unscoped*, so using a Forge-owned PAT means one leaked secret compromises every project in the Forge
    Supabase account. That is an argument for OAuth (scoped, revocable per org) whenever we act on a
    *user's* project, and for strong Vault handling if we ever hold a PAT.

### 4. Free tier: project count and auto-pause

13. **Claim:** The Free plan allows a small number of **active** projects per organization — my
    recollection is **two** — and free projects are **paused automatically after about one week (7 days)
    of inactivity**, requiring a manual restore from the dashboard to come back.
    **Sources (to verify):** `https://supabase.com/pricing`,
    `https://supabase.com/docs/guides/platform/billing-on-supabase` and the platform "Limits"/"Compute"
    pages.
    **Support:** recall (UNVERIFIED). **Confidence:** medium on the 2-project figure, medium-high on the
    7-day pause. The 7 days matches what `docs/01-atoms-core-features.md` reports Atoms telling its users,
    which is weak corroboration (Atoms is a second-hand source restating Supabase, not an authority on it).
    **This is a pricing/limits claim and the ticket asked for `source_check` on it — that check did not
    happen.** Re-verify before any user-facing copy.
    **Consequence if true:** a generated app parked on a visitor's free project is dead a week later
    unless the visitor manually restores it. For a demo-heavy product where most apps are opened once,
    that is a bad default and a support-load generator.

### 5. Anon key in the browser, and whether RLS is the only defense

14. **Claim:** Yes — shipping the anon (now "publishable") key in client-side code is the **intended
    design**. Supabase documents the anon key as safe for browsers *on the condition that RLS is enabled*
    on exposed tables, and documents the `service_role` (now "secret") key as **never** to be exposed to
    a client because it **bypasses RLS entirely**.
    **Sources (to verify):** `https://supabase.com/docs/guides/api/api-keys`,
    `https://supabase.com/docs/guides/api/securing-your-api`.
    **Support:** recall (UNVERIFIED). **Confidence:** high on substance. This is the single most
    consistently stated security position in Supabase's documentation and I would be surprised if it has
    changed.

15. **Claim:** Supabase introduced a **new API key model** (`sb_publishable_…` / `sb_secret_…`) to
    replace the legacy JWT-based `anon` / `service_role` keys, with the legacy keys on a deprecation path.
    **Sources (to verify):** `https://supabase.com/docs/guides/api/api-keys`, Supabase changelog/blog.
    **Support:** recall (UNVERIFIED). **Confidence:** medium on existence, **low on current status and
    timeline.** This is the most freshness-sensitive item in the brief: if legacy keys are disabled by
    2026, generated code templates that reference `SUPABASE_ANON_KEY` are wrong on day one. **Verify first,
    before writing any template.**

16. **Claim, precisely stated:** RLS is not literally the *only* defense, and it is worth being exact
    because the ticket asked for precision. The defenses that actually exist alongside it, to the best of
    my recall:
    - **RLS policies** — the primary authorization boundary for anon-key traffic. *(high confidence)*
    - **Schema exposure** — only schemas configured as exposed (`public`, plus opt-ins) are reachable
      through the auto-generated REST API; objects outside them are not addressable by the client at all.
      *(medium-high)*
    - **Postgres grants and column privileges** on the `anon` / `authenticated` roles — RLS filters rows;
      grants decide whether the role can touch the table or column in the first place. *(medium-high)*
    - **Platform-level rate limits and, on paid plans, network restrictions / IP allowlists.**
      *(medium; the paid-plan gating is a pricing claim I could not verify)*
    - **Not** a defense: obscurity of the key, or the app's own client-side checks.
    **Support:** recall + interpretation. **Confidence:** medium-high overall.
    **The practically important consequence:** with the anon key public, *anything the `anon` role is
    granted and not filtered by a policy is world-readable/writable.* For Forge, where policies are
    LLM-authored, "RLS is the boundary" means "the LLM writes our security boundary." That should not
    stand unmitigated — see Next steps.

### 6. Anonymous end-users in generated apps

17. **Claim:** Supabase Auth supports **anonymous sign-in** (`supabase.auth.signInAnonymously()`), which
    issues a real JWT with a stable `sub`, so RLS policies keyed on `auth.uid()` work for a user who never
    supplied an email, and the identity can later be upgraded to a permanent one.
    **Sources (to verify):** `https://supabase.com/docs/guides/auth/auth-anonymous`.
    **Support:** recall (UNVERIFIED). **Confidence:** medium-high on existence, medium on the
    link-to-permanent-account details.
    **Why it matters:** this solves signup friction *inside the generated app* (its end-users need no
    account) but does nothing for signup friction *at the Supabase-account level* (the platform still
    needs someone's project). Keep the two layers separate when reasoning.

---

## Answer to the closing question: least friction for a no-signup visitor

**Ranked, with the disqualifying friction named.**

| Pattern | What the visitor must do first | Verdict |
|---|---|---|
| **A. Forge-owned shared project + RLS** | nothing | ✅ **Least friction. Recommended for MVP.** |
| **B. Forge-owned pool of pre-provisioned projects, one leased per app** | nothing | Viable fallback; better isolation, but consumes project quota and hits provisioning latency and (if Forge's own org is on a free plan) the auto-pause + 2-project ceiling. Needs paid-plan cost modelling, which is out of scope per the ticket. |
| **C. Management API creates a project per visitor** | have a Supabase account, or rely on unproven programmatic org creation | ❌ Blocked: no token exists for a visitor who never signed up; org creation unverified and likely restricted; multi-minute provisioning. |
| **D. Supabase OAuth (the Atoms pattern)** | sign up for Supabase, create/have an organization, complete a consent redirect, pick a project | ❌ Highest friction by a wide margin. It is the *right* pattern for "power user brings their own backend", not for first contact. |

**Recommended shape for the weekend build (researcher recommendation, not a sourced claim):**

1. One Forge-owned Supabase project. Generated apps talk to it with the **publishable/anon key embedded
   in the WebContainer code** — which is the intended design per finding 14, not a compromise.
2. **Forge mints the tenant identity, not the LLM.** Isolation keyed on a Forge-issued claim, with the
   policies written by *our* hand-audited template and applied by our migration path. The agent is
   allowed to add tables; it is **not** allowed to author the isolation policy. This is the single
   highest-leverage decision in the ticket.
3. Prefer **schema-per-app** over a shared-table `tenant_id` if it fits the time box, purely for blast
   radius. If it does not fit, ship shared-table + `tenant_id` with a CI check that fails any table
   lacking RLS.
4. The **secret/service-role key never enters a WebContainer.** Anything needing it runs on our side.
5. Keep **OAuth (pattern D) on the roadmap as "connect your own Supabase"** — it is the graduation path
   for a user who wants to own their data, and it maps cleanly onto the connector architecture already
   drafted in `docs/03-architecture.md` §8.

**Note on how this interacts with the WebContainer decision (inference, unverified):** generated code runs
in the *visitor's* browser, so every Supabase request originates from a `*.webcontainer*` origin and from
the visitor's IP. Two things to check early because they can silently break the demo: whether Supabase's
REST/Auth endpoints accept those cross-origin requests as-is, and whether Supabase Auth's **redirect-URL
allowlist** can accommodate WebContainer's dynamic preview hostnames (wildcards may help). If redirects
cannot be allowlisted, in-app OAuth logins inside previews will fail even though database access works.
Neither was verified.

---

## Contradictions

**None found** — and that is a weak statement here, not a reassuring one: with no ability to fetch
sources, I had no second source to contradict the first. The one place where two accounts exist is the
7-day auto-pause window, where `docs/01-atoms-core-features.md` (Atoms telling its users) agrees with my
recall of Supabase's own policy. Agreement between a second-hand source and unverified recall is not
corroboration.

---

## Missing evidence

Everything in this brief is formally unverified. The items where that actually changes a decision:

1. **Current API-key model and legacy-key deprecation status** (finding 15). Blocks writing the code
   template. Highest priority.
2. **Free-plan active-project count and auto-pause window** (finding 13). Pricing/limits claim the ticket
   explicitly wanted `source_check`ed. Blocks any "bring your own free project" messaging.
3. **Whether the OAuth grant is Supabase-side 1:1 per organization** (finding 3). The ticket asks
   directly. My answer is "probably an Atoms-side constraint" — that is inference and must not be
   recorded as fact.
4. **Whether arbitrary SQL / DDL is officially reachable with an OAuth token** (finding 5). Determines
   whether "the agent creates tables in the user's project" is a supported path or a hack.
5. **Whether an OAuth-scoped token can read a project's secret key** (finding 5). A privilege-escalation
   question; needs a real answer before we build on OAuth.
6. **Whether `POST /v1/organizations` is GA and permitted for OAuth apps** (finding 11).
7. **Exact scope strings** (finding 4).
8. **Management API rate limit number** (finding 12).
9. **WebContainer-origin CORS and Auth redirect-URL wildcard support** (closing note). Not a Supabase
   *policy* question so much as an empirical one — a 10-minute spike answers it better than docs would.
10. **Whether Supabase publishes an official multi-tenancy guide** endorsing any particular isolation
    strategy (finding 9). I asserted RLS is the recommended mechanism, which I am confident about; I did
    *not* verify that a dedicated multi-tenancy guide exists.

---

## Sources

**Kept — canonical URLs that own each claim, none of them fetched in this run:**

- Build a Supabase Integration (OAuth2) — `https://supabase.com/docs/guides/integrations/build-a-supabase-integration` — owns the OAuth flow, scope table, and per-organization consent.
- Management API reference — `https://supabase.com/docs/reference/api/introduction` and `.../v1-create-a-project` — owns token requirements, rate limits, project/org creation.
- Row Level Security — `https://supabase.com/docs/guides/database/postgres/row-level-security` — owns the isolation mechanism.
- Securing your API / API keys — `https://supabase.com/docs/guides/api/securing-your-api`, `https://supabase.com/docs/guides/api/api-keys` — owns the anon-key-in-browser and service-role-bypasses-RLS claims.
- Custom claims & RBAC — `https://supabase.com/docs/guides/database/postgres/custom-claims-and-role-based-access-control-rbac` — owns the `tenant_id`-in-JWT pattern.
- Anonymous sign-ins — `https://supabase.com/docs/guides/auth/auth-anonymous` — owns the no-signup end-user path.
- Pricing + platform limits/billing pages — `https://supabase.com/pricing`, `https://supabase.com/docs/guides/platform/billing-on-supabase` — own free-tier project count and auto-pause.
- `docs/01-atoms-core-features.md` (this repo) — second-hand corroboration of the Atoms OAuth UX and the 7-day pause. Read, and useful, but not authoritative on Supabase behaviour.
- `docs/03-architecture.md` (this repo) — read; §8 connector architecture is where pattern D would land.

**Rejected / deprioritized:**

- Blog posts and third-party tutorials on Supabase multi-tenancy — the ticket forbids blog summaries of primary sources, and they are the most likely to be stale on the API-key change.
- Bolt.new / Lovable Supabase-integration docs — would tell us what a competitor chose, not what Supabase supports. Interesting for pattern D UX later; not evidence for this ticket.

---

## Next steps

1. **Re-run this ticket with web tooling.** The URL list above is deliberately verification-ready: nine
   fetches plus `source_check` on the pricing and anon-key pages closes almost every gap. This is the
   only next step that matters much.
2. **Spike, don't read, the WebContainer→Supabase path.** Point a throwaway WebContainer app at a
   throwaway Supabase project and confirm cross-origin reads/writes and one auth redirect. Empirical, ~10
   minutes, answers what docs will not state clearly.
3. **Decide policy authorship before writing any agent prompt.** If the answer is "the LLM writes RLS
   policies," the shared-project pattern is unsafe and we should escalate that as its own decision. My
   recommendation is that isolation policies are template-owned and agent-immutable.
4. **Verify the key model before the code template exists** (finding 15), so we don't generate thousands
   of apps referencing a deprecated key name.
