# Living Brand Intelligence

An AI system for founders that understands what a startup **is**, remembers **why** each brand decision exists, and shows what must change when the startup changes.

It is not a brand-book generator and not a chat box that writes marketing copy. It is a structured, traceable system of record for a startup's context and the brand decisions derived from it, with AI used at the specific points where reasoning is genuinely valuable and a human approving everything that matters.

> **The question this product exists to answer:** if the startup changes, does the brand understand what needs to change — and can the founder see why?

---

## Demo

The full loop in one pass: a rough idea becomes structured context, context becomes approved brand decisions, the critic stress-tests them, the kit is exported, and then a new founder fact arrives and the system shows exactly which decision it invalidates.

<a href="video-EZRlGyG76uDg4hV7TpJ5.mp4">
  <video
    src="video-EZRlGyG76uDg4hV7TpJ5.mp4"
    controls
    preload="metadata"
    width="100%"
  ></video>
  <em>▶ Watch the walkthrough (MP4, 6 MB) — if the player does not load, open the file directly.</em>
</a>

---

## Table of contents

- [Demo](#demo)
- [The problem](#the-problem)
- [How the product works](#how-the-product-works)
- [Architecture](#architecture)
  - [Request lifecycle](#request-lifecycle)
  - [Directory map](#directory-map)
  - [Stage completion as a first-class concept](#stage-completion-as-a-first-class-concept)
- [Data model](#data-model)
- [The AI layer](#the-ai-layer)
- [Non-negotiable engineering rules](#non-negotiable-engineering-rules)
- [Getting started](#getting-started)
- [Environment variables](#environment-variables)
- [Database migrations](#database-migrations)
- [Scripts](#scripts)
- [Testing](#testing)
- [Security posture](#security-posture)
- [Known constraints and traps](#known-constraints-and-traps)
- [Design principles](#design-principles)
- [Further reading](#further-reading)

---

## The problem

An early-stage founder knows a problem, a rough audience, and maybe a differentiator — but rarely the audience, the positioning, the differentiation, or which assumptions are load-bearing. AI can generate polished branding in seconds, and that is exactly the problem: generic output erases the specific characteristics that make a startup different. "Empowering the next generation of innovators" could describe a thousand companies.

A second problem appears later. Startups learn. The paying customer turns out to be someone other than the assumed one. A pivot invalidates last quarter's positioning. A brand system with no memory of *why* a decision was made cannot follow — and a system that overwrites instead of versioning loses the reasoning that made the brand defensible.

This product keeps two things at once:

1. the **current** structured understanding of the startup, and
2. the **history** of how that understanding and its brand decisions evolved.

---

## How the product works

The workspace is five stages plus an overview, rendered as tabs in one route (`/startups/[startupId]`). Each stage persists its own output, and the next stage reads only persisted data — so a page refresh never loses work and no stage depends on in-memory state from another.

```text
ROUGH IDEA
    ↓
DISCOVER ────────→ structured context (FACT / INFERENCE / HYPOTHESIS)
    ↓               founder confirms, corrects, or rejects each item
BRAND ──────────→ proposed decisions (11 categories) grounded in that context
    ↓               founder agrees / rejects / challenges the reasoning
CHALLENGE ───────→ critic findings + consistency verdicts + quality evaluation
    ↓
DELIVER ────────→ exportable brand kit assembled from active decisions
    ↓
EVOLUTION ───────→ new founder fact → impact analysis → approved revision
                   old decision becomes SUPERSEDED, new one ACTIVE
```

### The stages in detail

| Stage | What the AI does | What gets persisted | Human control |
|---|---|---|---|
| **Overview** | Nothing. Orients the founder. | — | — |
| **Discover** | Runs an adaptive interview, then extracts structured context | `context_items` rows typed `FACT` / `INFERENCE` / `HYPOTHESIS` | Founder confirms, corrects, or rejects every item before it becomes evidence |
| **Brand** | Proposes decisions per category, each grounded in specific approved context, each with a rationale | `brand_decisions` rows (`proposed` → `active` / `rejected`) | Founder agrees, rejects, or opens a challenge and revises the recommendation |
| **Challenge** | Critiques active decisions across six normalized checks, cross-checks pairs for consistency, and runs an independent quality evaluation per finding | `startups.challenge_run` summary (after `20260926_challenge_run.sql`) | Founder dismisses findings, applies a suggested alternative, rejects a decision, or approves a revision |
| **Deliver** | Nothing. Packages active decisions into a copyable/exportable brand kit | — | Export is gated on having at least one approved decision |
| **Evolution** | Analyses a new founder fact, identifies which active decisions it may affect, and proposes revisions with reasons and severities | `change_analyses` + `change_analysis_impacts`, plus new `brand_decisions` rows | Founder approves the revision, keeps the current decision, or rejects the analysis |

### Why Evolution exists

This is the differentiator, and the most subtle part of the codebase. When the founder learns something new, the system does **not** silently rewrite the brand. It produces an *analysis*: which decisions are affected, how severely, and why. Only on explicit approval does the old decision become `SUPERSEDED` and a revised copy become `active`, with `supersedes_id` preserving the chain and evidence links carried forward.

---

## Architecture

Deliberately small — one Next.js app, one Supabase project, hosted LLM APIs. No microservices, no Redis, no queues, no vector database, no agent framework. LangChain is used only as a lightweight composition primitive (`RunnableLambda`), not as an agent runtime.

### Stack

- **Next.js 16.3.6** (App Router, Turbopack, React Server Components, Server Actions)
- **React 19**
- **TypeScript** in strict mode
- **Tailwind CSS v4** — components are hand-rolled on Tailwind utilities; `components.json` configures shadcn/ui for future primitives
- **Supabase** (PostgreSQL + PostgREST + RLS) via `@supabase/ssr` and `supabase-js`
- **Hosted LLM APIs** — Gemini, OpenAI, Anthropic, or OpenRouter, selected by env var
- **`node:test`** for unit tests (no test framework dependency)

### Request lifecycle

```text
Browser
  │  React Server Component tree, server-rendered per tab
  ▼
app/startups/[startupId]/page.tsx        ← the only reader of workspace data
  │  reads persisted rows through lib/db/*
  ▼
lib/server.ts (Supabase SSR client, cookie-scoped)
  │
  ├─► StageProgressProvider  ← seeds stage completion from persisted state
  │      └─► WorkspaceTabs → one client section per stage
  │
  └─► Client section (e.g. BrandStrategySection)
         │  useActionState(...) → Server Action
         ▼
      app/actions/*.ts  ("use server")
         │  validate input → call lib/ai/* → validate AI output
         │  write through lib/db/* → revalidatePath
         ▼
      lib/db/* → Supabase → PostgreSQL (RLS applies)
```

Two rules keep this honest:

- **Server Components read, Server Actions write.** The page component performs all reads; client components never call the database directly.
- **Every AI response is validated before use.** Each `lib/ai/*` module pairs a model call with a `validate*Response` function that drops unknown ids, unknown enum values, and malformed structures, so a bad model response can never reach the database.

### Directory map

```text
app/
  actions/            Server Actions — the only write path
    startups.ts         create/load a startup
    interview.ts        discovery interview turns
    discovery.ts        structured extraction, confirm / correct / reject
    strategy.ts         strategy generation, approve, reject, challenge
    challenge.ts        critique, consistency, quality evaluation, revisions
    evolution.ts        founder facts, change analysis, approve / keep / reject
  components/         one client section per stage
    overview-section.tsx, discovery-section.tsx, brand-strategy-section.tsx,
    challenge-section.tsx, deliver-section.tsx, evolution-section.tsx
    workspace-tabs.tsx      tab shell + per-stage status indicator
    stage-progress.tsx      stage completion + run summaries (context)
    startup-idea-form.tsx   raw idea capture
  startups/[startupId]/page.tsx   workspace route; the only reader of workspace data
  page.tsx, layout.tsx, globals.css

lib/
  ai/                 AI layer — prompts, validation, orchestration
    orchestration.ts    pipelines: strategy / critique / consistency
    discovery.ts        interview extraction + provider resolution
    dialogue.ts         adaptive interview turns
    strategy.ts         strategy proposals
    challenge.ts        brand critic
    consistency.ts      pairwise consistency verdicts
    change.ts           change/impact analysis
    brand-checks.ts     six normalized checks + generic-language screening
    brand-direction.ts  founder brand-direction form options
    evaluation/         independent quality evaluators
      evaluator.ts        BrandEvaluator interface + normalisation
      gemini-evaluator.ts
      jev-evaluator.ts
    references/        methodology retrieval (RAG)
      retrieval.ts       keyword/category/workflow reference selection
      *.md               methodology documents (positioning, naming, voice, …)
  db/                 data access — every read and write lives here
    startups.ts, context.ts, brand-decisions.ts, evolution.ts
  challenge-run.ts    Challenge summary: project, persist-safe parse
  context-refs.ts     resolve "FACT <uuid>" references to real content
  types/database.ts   hand-maintained Database types (schema contract)
  types/impact-types.ts   the 11 values the DB accepts for impact_type
  server.ts, client.ts, middleware.ts, utils.ts

supabase/migrations/  SQL to apply in the Supabase SQL editor
tests/                node:test suites
docs/                 product and context-model specifications
```

### Stage completion as a first-class concept

`app/components/stage-progress.tsx` is the single source of truth for "is this stage done?", consumed by the tab indicators and the "N complete" counter in `workspace-tabs.tsx`, and by the Deliver stage. Every stage is **derived from persisted state on the server** and then may be updated in-session:

| Stage | Completion derived from |
|---|---|
| Discover | at least one active `FACT` / `INFERENCE` / `HYPOTHESIS` context item |
| Brand | at least one `active` brand decision |
| Challenge | `startups.challenge_run` is a well-formed summary with `status: "complete"` |
| Deliver | the export kit is available (≥1 approved decision) |
| Evolution | at least one change analysis exists |

A run that happens in the current session publishes itself immediately, so the UI stays responsive — but the server value is what a refresh restores. `lib/challenge-run.ts::parseChallengeRun` rejects `null`, non-objects, wrong `status`, and non-numeric counts, so a missing or malformed row can never grant completion.

---

## Data model

The context model is the foundation: the system never relies on the model remembering a conversation, and never stores the startup as one large generated summary. Knowledge is individual, typed, traceable rows.

```text
startups ──┬── context_items ────── context_relationships
           ├── brand_decisions ──── decision_relationships
           │        └───────────── decision_context_links ──┐
           ├── change_analyses ──── change_analysis_impacts  │
           └──── challenge_run (jsonb summary)              │
                                        context_items ◀───────┘
```

### Tables

| Table | Purpose | Key columns |
|---|---|---|
| `startups` | The workspace root | `id`, `name`, `raw_idea`, `description`, `challenge_run` (jsonb) |
| `context_items` | Structured memory — the only factual grounding | `startup_id`, `type`, `content`, `status`, `source`, `confidence`, `supersedes_id`, `rejection_reason`, `metadata` |
| `brand_decisions` | Strategic decisions derived from context | `category`, `title`, `content`, `rationale`, `status`, `supersedes_id` |
| `decision_context_links` | Which evidence supports which decision | `decision_id`, `context_item_id`, `relationship_type` |
| `context_relationships` | Typed links between context items | `from_context_id`, `to_context_id`, `relationship_type` |
| `decision_relationships` | Typed links between decisions | `from_decision_id`, `to_decision_id`, `relationship_type` |
| `change_analyses` | One impact analysis of one new fact | `source_context_item_id`, `summary`, `status`, `analysis` (json), `reviewed_at` |
| `change_analysis_impacts` | Which decision an analysis affects, and how badly | `change_analysis_id`, `brand_decision_id`, `impact_type`, `severity`, `reason` |

### Knowledge types

`context_items.type` separates what the founder said from what the model thinks:

- **`FACT`** — something the founder actually stated or confirmed.
- **`INFERENCE`** — the model's interpretation, not yet validated.
- **`HYPOTHESIS`** — an unconfirmed assumption.
- **`REJECTED`** / **`SUPERSEDED`** — preserved, not deleted. Rejecting a fact or superseding a decision keeps the row so history stays inspectable.

`context_items.status` (`active` / `archived`) is orthogonal to type. Brand grounding uses only `active` `FACT` / `INFERENCE` / `HYPOTHESIS` rows — this filter lives in `app/startups/[startupId]/page.tsx` and is the reason Discovery confirmation matters: unconfirmed context can never influence brand output.

### Decision lifecycle

```text
proposed ──agree──► active ──superseded by a revision──► superseded
    │                  ▲                                      │
    └──reject──► rejected                     (new row, supersedes_id → old)
```

Approval is never implicit. `supersedes_id` makes the chain walkable, which is what lets the UI show "supersedes previous" and render decision history.

### Enumerations

- **Decision categories (11):** `AUDIENCE`, `POSITIONING`, `VALUE_PROPOSITION`, `DIFFERENTIATION`, `PERSONALITY`, `NAMING`, `TAGLINE`, `VOICE`, `MESSAGING`, `VISUAL_DIRECTION`, `LAUNCH`.
- **`change_analysis_impacts.impact_type`:** the same 11 categories, lowercase — the database has a `CHECK` constraint enforcing exactly this. See [Known constraints](#known-constraints-and-traps).
- **`severity`:** `low` / `medium` / `high`.
- **Check statuses:** `PASS` / `NEEDS_REVIEW` / `INSUFFICIENT_EVIDENCE` — a check that cannot be grounded reports no verdict rather than guessing.
- **Relationship types:** `supports`, `derived_from`, `contradicts`, `affects`, `supersedes` (context); `supports`, `derived_from`, `contradicts`, `affects` (decision links).

---

## The AI layer

### Specialised stages, not one big prompt

Each capability is its own module with its own system prompt, its own typed result, and its own validator:

| Module | Responsibility |
|---|---|
| `lib/ai/dialogue.ts` | Adaptive interview turns — questions respond to prior answers |
| `lib/ai/discovery.ts` | Interview → structured context; provider resolution |
| `lib/ai/strategy.ts` | Category-shaped decision proposals |
| `lib/ai/challenge.ts` | Brand critic: normalized checks, evidence-based findings, alternatives |
| `lib/ai/consistency.ts` | Pairwise verdicts between related decisions |
| `lib/ai/change.ts` | New fact → affected decisions, severity, proposed revisions |

### Orchestration

`lib/ai/orchestration.ts` exposes three pipelines — `orchestrateStrategyGeneration`, `orchestrateCritique`, `orchestrateConsistency` — composed from `RunnableLambda` steps:

```text
retrieve methodology references (RAG)
    ↓
run the specialist
    ↓
validate the response
    ↓
independently evaluate findings (quality evaluator)
    ↓
return checks + findings + evaluations
```

The critique pipeline deliberately runs a **second, independent evaluation** on each finding (max 6) rather than trusting the critic's own confidence. An evaluator failure is captured as `evaluationError` and surfaced in the UI instead of silently degrading the result.

### Methodology retrieval (RAG)

`lib/ai/references/retrieval.ts` selects methodology documents by workflow (`strategy`, `critique`, `consistency`, `evaluation`, `revision`), decision category, and keyword overlap, then injects them as grounding text and returns the reference ids used — so the UI can show which methodology informed a finding. This is keyword/category selection over a handful of Markdown files, not a vector database.

### Anti-generic screening

`lib/ai/brand-checks.ts` defines the six normalized checks — generic language, contradiction, potential conflict, bias, audience mismatch, unsupported claim — plus `GENERIC_PHRASES` and `findGenericPhrases`. When a check cannot be grounded in approved context it returns `INSUFFICIENT_EVIDENCE` rather than inventing a defect — the system is explicitly allowed to say "I don't know".

### Provider configuration

`resolveAiConfig()` in `lib/ai/discovery.ts` picks a provider from `AI_PROVIDER` or the first available key among `OPENAI_API_KEY`, `OPENROUTER_API_KEY`, `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`, and returns an actionable configuration error listing every supported combination when none is set. Provider responses are requested as strict structured output and then re-validated locally.

---

## Non-negotiable engineering rules

These are the invariants that keep the product honest. Breaking one usually reintroduces a class of bug that has already been fixed here.

1. **The founder approves every strategic change.** AI proposes; `brand_decisions.status` transitions only through explicit server actions. Never write an active decision from an AI response.
2. **Never hide a write failure.** If a database write fails, return the real error to the UI. No hard-coded success, no bypass path, no "success" state when the row was not written.
3. **Validate before writing, not after.** Check every value against the schema's constraints *before* the first insert — with `CHECK` constraints and no `DELETE` grant, a late failure strands committed rows.
4. **Never coerce an invalid enum into a valid one.** Map deliberately at the boundary (see `impactRowsFromDrafts` in `app/actions/evolution.ts`) or reject. A silent coercion hides a vocabulary bug.
5. **Only confirmed context is evidence.** Brand grounding filters to `active` `FACT` / `INFERENCE` / `HYPOTHESIS`. Never ground output in unconfirmed or rejected items.
6. **Internal identifiers never reach the UI.** Resolve them to human-readable content at the presentation layer (`lib/context-refs.ts`) instead of hiding them with CSS or truncation.
7. **Stage completion is derived from persisted state,** never from a client-only boolean and never hard-coded.
8. **No new persistence mechanism.** Use the existing tables and the existing actions; a second path for the same fact is a bug.
9. **AI responses are validated locally** before use, whatever the provider claims.
10. **Deterministic code owns CRUD, filtering, sorting, validation, status changes, relationships, and UI state.** AI owns reasoning.

---

## Getting started

**Requirements:** Node.js 20 or newer (developed on 22), a Supabase project, and one LLM API key.

```bash
npm install
```

Create `.env.local` in the project root with the values from [Environment variables](#environment-variables):

```bash
npm run dev
```

Open <http://localhost:3000>, enter a rough startup idea, and follow the stages in order: Discover → confirm context → Brand → agree to decisions → Challenge → Deliver → add a new fact in Evolution.

Walk the whole loop before changing anything: the Evolution stage is only meaningful once a strategy exists and new information arrives.

---

## Environment variables

| Variable | Required | Purpose |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | yes | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | yes | Supabase anon/publishable key |
| `AI_PROVIDER` | no | Forces `openai` / `openrouter` / `anthropic` / `gemini` |
| `GEMINI_API_KEY` | one of | Gemini API key |
| `OPENAI_API_KEY` | one of | OpenAI API key |
| `ANTHROPIC_API_KEY` | one of | Anthropic API key |
| `OPENROUTER_API_KEY` | one of | OpenRouter API key |

`AI_PROVIDER` is optional — without it the first available key wins. If none is set, the UI shows an explicit configuration error naming every supported combination rather than failing silently. All keys are read server-side only; nothing secret reaches the client bundle.

---

## Database migrations

SQL lives in `supabase/migrations/` and is **applied by hand** in the Supabase dashboard → SQL Editor. The app's key is an anon/publishable key with no DDL rights, so `npm run dev` cannot migrate for you.

| File | What it does |
|---|---|
| `20260925_discovery_rls.sql` | RLS policies for the seven application tables, matching the pre-existing `anon_can_insert_startups` / `anon_can_select_startups` policies |
| `20260926_challenge_run.sql` | Adds `startups.challenge_run jsonb` plus `anon_can_update_startups`, so Challenge completion survives a refresh |

Apply them in filename order. After any schema change, update `lib/types/database.ts` by hand — it is the app's schema contract and is not auto-generated.

---

## Scripts

| Command | Purpose |
|---|---|
| `npm run dev` | Development server (Turbopack) |
| `npm run build` | Production build, including the TypeScript pass |
| `npm start` | Serve the production build |
| `npm run lint` | ESLint across the repo |
| `npm test` | Unit tests via `node --experimental-strip-types --test` |

Before calling any change done:

```bash
npx tsc --noEmit
npm run build
npm run lint
npm test
```

---

## Testing

Tests use the built-in `node:test` runner with `--experimental-strip-types`, so there is no test-framework dependency. `tests/register.mjs` installs a resolve hook that provides the `@/` path alias outside Next.

Current suites:

- `tests/brand-checks.test.ts` — check normalisation, generic-language screening, bias/evidence and consistency scenarios.
- `tests/evolution-impact-types.test.ts` — the 11 accepted `impact_type` values, category mapping, and rejection of drift vocabulary.
- `tests/challenge-run.test.ts` — Challenge summary projection, round-trip through persisted JSON, and rejection of malformed stored runs.

When adding tests, extend the `test` script in `package.json`; the glob is not automatic. Prefer testing pure modules (`lib/ai/*`, `lib/challenge-run.ts`, `lib/types/impact-types.ts`) — anything that imports `@/lib/server` needs a Next request context.

---

## Security posture

This is a demo-scale application and should be treated as one.

- **No authentication or authorization.** There is no login, no session, no user model, and no per-user data isolation — every request runs as the Supabase `anon` role. RLS is the only boundary, and those policies are permissive by design.
- **Permissions are broad.** `anon` can insert and update most tables. RLS cannot restrict an update to a single column, so `anon_can_update_startups` also permits changing `name`, `raw_idea`, and `description`.
- **`DELETE` is not granted** anywhere. Corrections and removals are modelled as status changes (`archived`, `rejected`, `superseded`) so history is preserved.
- **AI keys are server-only** and never exposed to the browser.
- **Before any real deployment:** add authentication, scope every policy to the authenticated user, drop the permissive anon policies, and re-check whether the challenge-run write needs a `SECURITY DEFINER` function instead of a table-wide update grant.

---

## Known constraints and traps

Hard-won knowledge. Each of these caused or nearly caused a production-visible bug.

- **`change_analysis_impacts.impact_type` is constrained by the database** to the 11 decision categories, lowercase (`audience`, `visual_direction`, …). The column answers *which kind of decision is impacted* — not *what kind of drift occurred*. The analyst's drift classification is a different vocabulary and must not be written to this column; it lives in the analysis JSON and the UI (`lib/types/impact-types.ts`, `impactRowsFromDrafts` in `app/actions/evolution.ts`).
- **Validate before the first insert.** `createChangeAnalysis` validated too late and could commit an analysis row whose impacts then failed, stranding an approved analysis with no impacts — unrecoverable, because `DELETE` is not granted.
- **`lib/types/database.ts` is hand-maintained.** A `string`-typed enum in it will not catch a `CHECK`-constraint violation. When a column has a database constraint, mirror the allowed values in a TypeScript union.
- **This Next.js version is not the one in most training data.** Read `node_modules/next/dist/docs/` before using an API, and honour deprecation notices. `AGENTS.md` is auto-managed by `next dev` — do not hand-edit the block it maintains.
- **Do not import server modules into client components.** `lib/server.ts` pulls `next/headers`; importing it through a shared path breaks the client build. Keep shared pure logic in dependency-free modules such as `lib/context-refs.ts` and `lib/types/impact-types.ts`.
- **UUID leakage is a recurring failure mode.** Model-written text cites context as `FACT <uuid>`. Any new surface rendering a rationale must resolve references through `lib/context-refs.ts` rather than printing the raw string.
- **Live data is shared.** The app points at a real Supabase project. Probing it with ad-hoc scripts writes real rows that cannot be deleted through the app.

---

## Design principles

- **Show the reasoning, not just the output.** Every decision can be expanded to its rationale and its supporting evidence.
- **Make the AI workflow visible.** The interface shows stage progression, checks, severities, and what the model could not verify — it should never look like a generic chat box.
- **Prefer honest uncertainty to fabricated certainty.** Missing evidence yields `INSUFFICIENT_EVIDENCE`, not an invented finding.
- **Human-in-the-loop by construction.** Propose, compare, explain, detect — never silently rewrite.
- **Preserve history.** Rejection and supersession are recorded, not erased.
- **Specific beats impressive.** "Empowering the next generation" fails; a statement traceable to a founder-confirmed fact passes.

---

## Further reading

- [`docs/PRODUCT.md`](docs/PRODUCT.md) — full product specification: thesis, user journey, anti-generic principle, non-goals, success criteria.
- [`docs/CONTEXT_MODEL.md`](docs/CONTEXT_MODEL.md) — the structured-memory model and why `FACT` / `INFERENCE` / `HYPOTHESIS` are kept distinct.
- [`docs/AI_WORKFLOW.md`](docs/AI_WORKFLOW.md) and [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — the intended stage sequence.
- [`lib/ai/references/`](lib/ai/references/) — the methodology documents injected as grounding.
- [`supabase/migrations/`](supabase/migrations/) — RLS policies and schema changes.
