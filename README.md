# Living Brand Intelligence

### Build a brand that remembers why.

Living Brand Intelligence is an AI-powered brand intelligence system for early-stage startups. It understands the startup, remembers why brand decisions were made, lets founders challenge those decisions, and helps the brand evolve when the startup changes.

[![Next.js](https://img.shields.io/badge/Next.js-16.3.6-000000?style=flat-square&logo=nextdotjs)](https://nextjs.org)
[![React](https://img.shields.io/badge/React-19.2.8-20232A?style=flat-square&logo=react)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-4-06B6D4?style=flat-square&logo=tailwindcss)](https://tailwindcss.com)
[![Supabase](https://img.shields.io/badge/Supabase-PostgreSQL-3ECF8E?style=flat-square&logo=supabase)](https://supabase.com)
[![LangChain](https://img.shields.io/badge/LangChain-1.2.12-1C3C3C?style=flat-square)](https://js.langchain.com)
[![Google Gemini](https://img.shields.io/badge/Google_Gemini-API-8A6BFF?style=flat-square&logo=googlegemini)](https://ai.google.dev)
[![Vercel](https://img.shields.io/badge/Deployed_on-Vercel-000000?style=flat-square&logo=vercel)](https://vercel.com)

[![Live Product](https://img.shields.io/badge/Live_Product-Visit_now-111111?style=for-the-badge)](https://living-brand-intelligence.vercel.app/)
[![Interactive Demo](https://img.shields.io/badge/Interactive_Demo-Play_walkthrough-111111?style=for-the-badge)](https://app.arcade.software/share/videos/EZRlGyG76uDg4hV7TpJ5)
[![Source](https://img.shields.io/badge/Source-GitHub-181717?style=for-the-badge&logo=github)](https://github.com/yash-blip-ys/living-brand-intelligence)

---

## Demo

The whole loop in one pass: a rough idea becomes structured context, context becomes approved brand decisions, the founder challenges them, the kit is exported, and then a new founder fact arrives and the system shows exactly which decision it invalidates.

[![Living Brand Intelligence demo](demo.gif)](https://app.arcade.software/share/videos/EZRlGyG76uDg4hV7TpJ5)

[Watch the interactive Arcade demo](https://app.arcade.software/share/videos/EZRlGyG76uDg4hV7TpJ5)

<sub>The preview above is a lightweight GIF generated from the demo recording in this repository. The original video is untouched: [video-EZRlGyG76uDg4hV7TpJ5.mp4](video-EZRlGyG76uDg4hV7TpJ5.mp4) — 63 s, 1920×1080.</sub>

---

## The Problem

AI can generate a brand quickly. That is exactly the problem.

Startups change constantly — the paying customer turns out to be someone else, a pivot invalidates last quarter's positioning, a differentiator emerges that nobody planned for. One-shot AI generators and traditional branding workflows produce a polished artefact and then forget the reasoning behind it. When the startup pivots, the founder is left rebuilding from scratch or manually reconciling documents with no memory of *why* anything was decided.

Two things get lost: the reasoning, and the history.

---

## The Idea

Branding is a **continuous decision system**, not a one-time generation task.

```text
Startup Context
      ↓
Brand Decision
      ↓
Why
      ↓
New Learning
      ↓
Impact Analysis
      ↓
Proposed Revision
      ↓
Founder Approval
```

Every decision keeps its rationale and the evidence it was grounded in. When reality changes, the system does not rewrite anything — it shows which decision is affected, how severely, and what a revision would look like.

> **The AI doesn't silently rewrite the brand. The founder stays in control.**

---

## How It Works

| Stage | What happens |
|---|---|
| **01 — Discover** | A rough startup idea becomes structured **Facts**, **Inferences**, and **Hypotheses** through an adaptive AI interview. The founder confirms, corrects, or rejects every item. |
| **02 — Brand** | A connected brand strategy is generated across eleven decision categories, each grounded in *approved* context and each carrying its own rationale. |
| **03 — Challenge** | The founder challenges individual AI recommendations, reviews the critic's findings and consistency verdicts, and approves revisions. |
| **04 — Deliver** | Approved decisions are assembled into a coherent, exportable brand system — one section per category, through launch copy. |
| **05 — Evolution** | A new founder fact is analysed against existing decisions. Affected decisions are surfaced with severity and reason, and a targeted revision is proposed. |

Unconfirmed context can never influence brand output: only context the founder approved is used as evidence.

---

## Key Features

- **Structured AI Discovery** — an adaptive interview, not a fixed questionnaire, producing typed `FACT` / `INFERENCE` / `HYPOTHESIS` context.
- **Persistent Brand Context** — every approved item and decision is stored in Postgres, not held in a session.
- **Decision Traceability** — any decision expands to its rationale and the specific context items supporting it.
- **Founder Approval** — AI proposes; only explicit approval writes an `active` decision.
- **Challenge / Revision Workflow** — a founder can challenge a single recommendation, answer, and get a revised version.
- **Brand Consistency Analysis** — pairwise verdicts across related decisions, flag contradictions and potential conflicts.
- **Evolution Impact Analysis** — new information is mapped to the specific decisions it affects, with severity and reasoning.
- **Current vs Proposed** — the existing decision and the proposed revision are always shown side by side, never merged automatically.
- **Evidence-Based Criticism** — a normalized check framework (generic language, contradiction, potential conflict, bias, audience mismatch, unsupported claim) that reports `INSUFFICIENT_EVIDENCE` rather than inventing a defect.
- **Independent Quality Evaluation** — critic findings are re-evaluated by a second evaluator before they are shown.
- **Supabase Persistence** — Postgres with Row Level Security across eight tables.
- **Gemini-Powered AI Workflows** — staged model calls with strict structured output and local re-validation of every response.

There are no autonomous agents. Each stage is a specialised, validated model call with a human in the loop.

---

## What Makes It Different?

**One-shot AI branding**

```text
Idea → Brand → Done
```

The output is detached from its reasoning. When the startup changes, there is nothing to reconcile against.

**Living Brand Intelligence**

```text
Context → Decision → Why → New Learning → Impact → Revision → Approval
```

Every arrow is persisted. The brand is a versioned history of decisions, each with rationale, evidence, and a successor when it was revised. That is what makes a pivot a *diff* instead of a rebuild — and it is why the product can answer *"which decisions does this new information invalidate, and why?"* at all.

---

## Architecture

```text
Founder
  ↓
AI Discovery
  ↓
Startup Context
├── Facts
├── Inferences
└── Hypotheses
  ↓
Brand Strategy
  ↓
Brand Decisions
  ↓
Persistent Brand Knowledge
  ↓
New Founder Evidence
  ↓
Change / Impact Analysis
  ↓
Current vs Proposed
  ↓
Founder Approval
  ↓
Updated Brand
```

### Layers

| Layer | Responsibility |
|---|---|
| **Route** (`app/startups/[startupId]/page.tsx`) | Server Component; the only reader of workspace data. Seeds stage completion from persisted state. |
| **Stage sections** (`app/components/*-section.tsx`) | One client component per stage. Presentation, review actions, and the visible AI workflow. |
| **Server Actions** (`app/actions/*.ts`) | The only write path. Validate input, call the AI layer, validate the response, persist, revalidate. |
| **AI layer** (`lib/ai/*`) | One specialist module per capability, each with its own prompt, typed result, and validator, composed into pipelines. |
| **Data access** (`lib/db/*`) | Every read and write. Nothing else touches Supabase directly. |
| **Persistence** (Supabase / Postgres) | Context, decisions, evidence links, change analyses, impacts — with RLS. |

### Request lifecycle

```text
Browser
  │  Server Component tree, rendered per stage
  ▼
app/startups/[startupId]/page.tsx
  │  reads persisted rows through lib/db/*
  ▼
Supabase SSR client (lib/server.ts)
  │
  ├─► StageProgressProvider  ← stage completion seeded from persisted state
  │      └─► WorkspaceTabs → one client section per stage
  │
  └─► Stage section (client)
         │  useActionState(...) → Server Action
         ▼
      app/actions/*.ts  ("use server")
         │  validate input → lib/ai/* → validate AI output
         │  write through lib/db/*
         ▼
      Supabase → Postgres (RLS applies)
```

Two rules hold this together: **server components read, server actions write**, and **every AI response is validated locally** before it is allowed anywhere near the database.

---

## Decision Model

The system never stores the startup as one large generated summary, and never relies on a model remembering a conversation. Knowledge is individual, typed, traceable rows.

| Type | Meaning |
|---|---|
| **FACT** | Explicitly provided or confirmed by the founder. |
| **INFERENCE** | AI-derived interpretation of available context. |
| **HYPOTHESIS** | A proposed but unvalidated interpretation. |
| **DECISION** | A founder-approved brand decision. |
| **REJECTED** | Context the founder declined. Preserved, not deleted. |
| **SUPERSEDED** | A previous decision replaced by a newer approved one. |

### Decision lifecycle

```text
proposed ──approve──► active ──revised by founder──► superseded
    │                    ▲                               │
    └──reject──► rejected          (new row, supersedes_id → old)
```

History is preserved rather than overwritten: `supersedes_id` makes the chain walkable, so the UI can show *what this decision replaced* and render the full lineage.

### Persistence

| Table | Purpose |
|---|---|
| `startups` | Workspace root; holds the persisted Challenge run summary |
| `context_items` | Typed structured memory — the only factual grounding |
| `brand_decisions` | Strategic decisions, with rationale and supersession chain |
| `decision_context_links` | Which evidence supports which decision |
| `context_relationships` | Typed links between context items |
| `decision_relationships` | Typed links between decisions |
| `change_analyses` | One impact analysis of one new fact |
| `change_analysis_impacts` | Which decision an analysis affects, how severely, and why |

---

## AI Workflow

This is not one giant prompt. It is a sequence of specialised, validated stages:

1. **Discovery** — adaptive interview turns that respond to earlier answers.
2. **Context structuring** — the conversation becomes typed `FACT` / `INFERENCE` / `HYPOTHESIS` rows.
3. **Brand strategy generation** — category-shaped proposals grounded in approved context.
4. **Challenge / revision** — a founder challenges a recommendation and receives a revision grounded in the same evidence.
5. **Consistency analysis** — pairwise verdicts across related decisions.
6. **Evolution impact analysis** — a new fact mapped to affected decisions with severity and proposed revisions.
7. **Founder approval** — the only step that writes an `active` decision.

Later stages operate on **persisted, approved context** — they never restart from the original idea. Each model call is composed in `lib/ai/orchestration.ts` as retrieve methodology → run the specialist → validate → independently evaluate. Model responses are requested as strict structured output and re-validated in code, so a malformed response can never reach the database.

Provider selection is configuration-driven (`AI_PROVIDER`), and the active deployment runs on the **Google Gemini API**; OpenAI, Anthropic, and OpenRouter are also supported.

---

## Tech Stack

| Layer | Technology |
|---|---|
| **Frontend** | Next.js 16.3.6 (App Router, React Server Components, Turbopack), React 19.2.8, TypeScript 5, Tailwind CSS 4 |
| **Backend** | Next.js server actions and server components — no separate API service |
| **Database** | Supabase (PostgreSQL) with Row Level Security |
| **AI** | Google Gemini API (active), with OpenAI / Anthropic / OpenRouter supported; LangChain for pipeline composition; independent quality evaluators; optional LangSmith tracing |
| **Deployment** | Vercel |
| **Version control** | GitHub |

---

## Project Structure

```text
app/
  actions/            Server actions — the only write path
    startups, interview, discovery, strategy, challenge, evolution
  components/         One client section per stage, plus the tab shell
  startups/[startupId]  Workspace route (the only reader of workspace data)
lib/
  ai/                 Prompts, validation, orchestration, evaluators
    references/       Methodology documents injected as grounding
  db/                 All reads and writes
  types/              Hand-maintained database types and enums
  server.ts client.ts middleware.ts   Supabase clients and session helper
supabase/migrations/  RLS policies and schema changes (applied by hand)
tests/                node:test unit suites
docs/                 Product, context-model, and architecture specifications
```

---

## Getting Started

```bash
git clone https://github.com/yash-blip-ys/living-brand-intelligence.git
cd living-brand-intelligence
npm install
npm run dev
```

Open <http://localhost:3000>, enter a rough startup idea, and walk the stages in order: **Discover → confirm context → Brand → agree to decisions → Challenge → Deliver → add a new fact in Evolution**.

The Evolution stage is only meaningful once a strategy exists and new information arrives — walk the whole loop before changing anything.

Database migrations are applied by hand (see [Migrations](#migrations)); the app's key is a publishable key with no DDL rights.

---

## Environment Variables

Create `.env.local` in the project root:

```bash
# Supabase — project URL and publishable (anon-role) key
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your_supabase_anon_key

# AI provider — "gemini" | "openai" | "anthropic" | "openrouter"
AI_PROVIDER=gemini
GEMINI_API_KEY=your_gemini_api_key
```

| Variable | Required | Purpose |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | yes | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | yes | Publishable key — this project's name for the anon-role key |
| `AI_PROVIDER` | no | Forces a provider; otherwise the first available key wins |
| `GEMINI_API_KEY` | one of | Gemini API key |
| `GEMINI_MODEL`, `GEMINI_BASE_URL` | no | Model override / proxy endpoint |
| `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `OPENROUTER_API_KEY` | no | Alternative providers |
| `LANGSMITH_TRACING`, `LANGSMITH_API_KEY`, `LANGSMITH_PROJECT` | no | Optional pipeline tracing |

> **Never commit secrets.** `.env*` is git-ignored. Only `NEXT_PUBLIC_*` values reach the browser, so no model key is ever bundled into client code.

---

## Scripts

| Command | Purpose |
|---|---|
| `npm run dev` | Development server |
| `npm run build` | Production build, including the TypeScript pass |
| `npm start` | Serve the production build |
| `npm run lint` | ESLint across the repository |
| `npm test` | Unit tests via the built-in `node:test` runner |

## Testing

```bash
npm test          # unit tests
npx tsc --noEmit  # type check
npm run lint      # lint
```

Tests use Node's built-in runner (`node --experimental-strip-types --test`) — no test-framework dependency. `tests/register.mjs` provides the `@/` path alias outside Next.

| Suite | Covers |
|---|---|
| `tests/brand-checks.test.ts` | Check normalisation, generic-language screening, bias/evidence and consistency scenarios |
| `tests/evolution-impact-types.test.ts` | The accepted `impact_type` vocabulary, category mapping, rejection of drift values |
| `tests/challenge-run.test.ts` | Challenge summary projection, round-trip through persisted JSON, malformed-run rejection |

When adding a suite, add it to the `test` script in `package.json` — the file list is explicit, not a glob. Prefer testing pure modules; anything importing `lib/server` needs a Next request context.

---

## Migrations

SQL lives in `supabase/migrations/` and is applied in the Supabase dashboard → SQL Editor, in filename order.

| File | Contents |
|---|---|
| `20260925_discovery_rls.sql` | RLS policies for the application tables |
| `20260926_challenge_run.sql` | `startups.challenge_run` (jsonb) plus the update policy that lets Challenge completion survive a refresh |

`lib/types/database.ts` is maintained by hand and is the app's schema contract — update it with any schema change.

---

## Engineering Notes

A few invariants that keep the system honest, and the traps that motivated them.

- **Validate before writing, not after.** `CHECK` constraints plus the absence of a `DELETE` grant mean a late failure strands committed rows. Every value is validated before the first insert.
- **`change_analysis_impacts.impact_type` is constrained by the database** to the eleven decision categories, lowercase. The column answers *which kind of decision is impacted*; the analyst's drift classification is a different vocabulary and lives in the analysis payload instead.
- **Internal identifiers never reach the UI.** Model-written text cites context as `FACT <uuid>`; references are resolved to real content at the presentation layer rather than hidden with CSS.
- **Stage completion is derived from persisted state**, never from a client-only flag and never hard-coded.
- **This Next.js version is not the one in most training data** — read the bundled docs in `node_modules/next/dist/docs/` before using an API.
- **Keep pure logic in dependency-free modules.** Importing `lib/server.ts` into a client component breaks the client build.

## Security Posture

This is a demo-scale application and should be treated as one.

- **No authentication or authorization.** There is no login and no per-user isolation; every request runs as the Supabase `anon` role, and RLS is the only boundary.
- **Permissions are broad.** `anon` can insert and update most tables. RLS cannot restrict an update to a single column, so the policy that persists the Challenge run also permits changing other `startups` columns.
- **`DELETE` is not granted anywhere** — corrections are modelled as status changes (`archived`, `rejected`, `superseded`) so history is preserved.
- **Before a real deployment:** add authentication, scope every policy to the authenticated user, and replace permissive anon grants with least-privilege ones.

---

## Deployment

The application is deployed on Vercel and requires no additional infrastructure — no separate API service, queue, cache, or vector database.

**https://living-brand-intelligence.vercel.app/**

Set the environment variables from [Environment Variables](#environment-variables) in the Vercel project settings, and apply the [migrations](#migrations) to your Supabase project.

---

## Built for Inkloom Hackathon

Living Brand Intelligence was built for the **Inkloom Hackathon**, focusing on AI-native brand intelligence and continuous brand evolution — treating brand decisions as versioned, evidence-backed records rather than generated text.

Inkloom is the title and presenting sponsor supporting this opportunity for builders: **https://inkloom.art**

Participant code: `INKLOOM-WCC`

---

## Contributing

Built as a hackathon project — a single-author build, developed with AI coding agents. See the repository's commit history and contributor graph for provenance.

Issues and pull requests are welcome on [GitHub](https://github.com/yash-blip-ys/living-brand-intelligence).

---

## Further Reading

- [`docs/PRODUCT.md`](docs/PRODUCT.md) — product specification: thesis, user journey, anti-generic principle, non-goals.
- [`docs/CONTEXT_MODEL.md`](docs/CONTEXT_MODEL.md) — the structured-memory model behind `FACT` / `INFERENCE` / `HYPOTHESIS`.
- [`docs/AI_WORKFLOW.md`](docs/AI_WORKFLOW.md) — the intended stage sequence.
- [`lib/ai/references/`](lib/ai/references/) — the methodology documents injected as grounding.
- [`supabase/migrations/`](supabase/migrations/) — RLS policies and schema changes.

---

## Living Brand Intelligence

Understand.
Remember.
Challenge.
Evolve.

[![Live Product](https://img.shields.io/badge/Live_Product-living--brand--intelligence.vercel.app-111111?style=for-the-badge)](https://living-brand-intelligence.vercel.app/)
[![Interactive Demo](https://img.shields.io/badge/Interactive_Demo-Arcade-111111?style=for-the-badge)](https://app.arcade.software/share/videos/EZRlGyG76uDg4hV7TpJ5)
