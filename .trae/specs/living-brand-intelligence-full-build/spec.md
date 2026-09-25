# Living Brand Intelligence — Full Product Build
## Product Requirements Document

## Overview
- **Summary**: Extend the existing 4-stage (Foundation/Discovery/Strategy/Evolution) MVP into a complete, polished, demo-ready brand intelligence product matching the Inkloom handbook: Discover → Position → Shape → Visualize → Challenge → Deliver. The product transforms a rough startup idea into a coherent, launch-ready brand system via visible, role-specialized AI workflow stages, grounded in approved context, with mandatory founder review at every decision gate.
- **Purpose**: Deliver a real working demo experience (not mock screens) that proves the central thesis: a brand is a living system, not a one-time AI-generated document.
- **Target Users**: Early-stage founders evaluating or building a brand strategy in a hackathon or first-product context.

## Goals
- G1. SHAPE: Strengthen the 5 existing strategy categories (PERSONALITY / NAMING / TAGLINE / VOICE / MESSAGING) to produce multi-part, structured, actionable output rather than single-paragraph text.
- G2. VISUALIZE: Upgrade VISUAL_DIRECTION to a substantive Visual Design Brief with 7 dimensions.
- G3. CHALLENGE: Deliver a new visible Challenge stage that audits active brand decisions across 8 defect types, with KEEP / REJECT / REVISE founder actions.
- G4. CONSISTENCY GUARDIAN: Cross-check 9 decision-pairs for coherence and return PASS / NEEDS REVIEW / CONFLICT with fixes.
- G5. DELIVER: Build a polished, exportable Brand Kit page assembling all approved decisions into structured sections (Foundation / Positioning / Personality / Naming / Tagline / Voice+Messaging / Visual / Quality / Launch).
- G6. OVERVIEW: Refine Overview tab to display startup headline numbers + active audience/positioning/value/personality/tagline + challenge status + consistency status + recent evolution (read-only, no AI calls).
- G7. WORKFLOW VISIBILITY: Surface the 7-role AI workflow (Discover Analyst → Positioning Strategist → Brand Shaper → Visual Strategist → Brand Critic → Consistency Guardian → Launch Strategist) in the UI so the demo visibly reasons through stages.
- G8. NAVIGATION: Expand workspace tabs from 4 to 6: Overview / Discover / Brand / Challenge / Deliver / Evolution.
- G9. BUILD QUALITY: Exit with `npm run build` passing 0 TypeScript errors and 0 build errors.

## Non-Goals
- NG1. Do not modify the Supabase database schema or add new tables / columns / migrations.
- NG2. Do not add auth, billing, teams, RAG/vector DB, Redis, queues, microservices, schedulers, logo generator, website builder, notifications, complex graph, mobile app, or admin dashboard.
- NG3. Do not change `.env.local`, expose API keys client-side, start the dev server, or make live AI calls during implementation.
- NG4. Do not rewrite or replace working existing abstractions (Supabase helpers in `lib/server.ts` / `lib/db/*`, AI provider abstraction in `lib/ai/discovery.ts`, server actions, React forms with `useFormState`).
- NG5. Do not add PDF export; prefer Markdown + JSON + clipboard copy.
- NG6. Do not run AI on page load / refresh / typing / navigation / tab switching / expanding UI — only on explicit button submit.
- NG7. Do not silently overwrite, rewrite, or delete approved decisions. All changes require founder approval and use status transitions (superseded / rejected) preserving history.

## Background & Context
### Current implemented state (preserve)
- M1 Foundation: landing page with startup form; workspace route `/startups/[startupId]`; Supabase persistence; build passes.
- M2 Discovery: `lib/ai/discovery.ts`, `lib/db/context.ts`, `app/actions/discovery.ts`, `app/components/discovery-section.tsx` — rough idea → AI FACT/INFERENCE/HYPOTHESIS → approve/reject → context_items persisted.
- M3 Strategy: `lib/ai/strategy.ts`, `lib/db/brand-decisions.ts`, `app/actions/strategy.ts`, `app/components/brand-strategy-section.tsx` — approved context → 11 category decisions → approve/reject. 4 UI groups: FOUNDATION / EXPRESSION / IDENTITY / GO-TO-MARKET. WHY expansion per active card (rationale + supporting context chips).
- M4 Evolution: `lib/ai/change.ts`, `lib/db/evolution.ts`, `app/actions/evolution.ts`, `app/components/evolution-section.tsx` — new FACT → impact analysis → Current vs Proposed (with proposed_title/proposed_content/proposed_rationale) → Approve revision / Keep current / Reject → supersede old → activate new → history visible.
- Database tables (fixed, 8): startups, context_items, brand_decisions, context_relationships, decision_context_links, decision_relationships, change_analyses, change_analysis_impacts. No metadata column on brand_decisions — so rich structured output for strategy categories lives inside the `content` TEXT field using unambiguous, sectioned formatting that UI can parse by line prefixes (`### `) for display.
- `brand_decisions.status` ∈ {proposed, active, rejected, superseded}.
- `context_items.type` ∈ {FACT, INFERENCE, HYPOTHESIS, DECISION, REJECTED, SUPERSEDED}.
- Existing 4-tab WorkspaceTabs (Overview / Discovery / Strategy / Evolution) with hint labels — to be expanded to 6 tabs with "Brand" (Strategy re-label) plus Challenge + Deliver.
- AI provider abstraction: Gemini (gemini-3.5-flash-lite, query-param key, v1beta spec) / OpenAI / OpenRouter / Anthropic. Driven by `AI_PROVIDER` env var.

### Core extension pattern (minimum-change, no-schema-change)
Because `brand_decisions.content` is the only writable rich field:
- SHAPE and VISUALIZE category outputs (PERSONALITY / NAMING / TAGLINE / VOICE / MESSAGING / VISUAL_DIRECTION / LAUNCH) are formatted as **sectioned structured text** inside `content` using stable markdown-style headings (`### Traits`, `### Why each fits`, `### How each appears`, etc.). UI renders sections via simple string parsing (`split(/\n### /)`) in the Brand section cards and in the Deliver Brand Kit. No JSON schema changes needed; rationale + supporting_context_ids continue to work unchanged.
- CHALLENGE findings and CONSISTENCY check results are NOT persisted to the database. They live in client component state during a session and: KEEP = local dismiss, REJECT = call existing `rejectBrandDecision`, REVISE = re-run `runStrategyGeneration` with an extra guidance FormData field ("challengeGuidance") scoped to the affected category. This reuses the full strategy AI pipeline with minimal new code. Consistency Guardian "Fix suggested" similarly flows through revised strategy.
- DELIVER Brand Kit reads all `brand_decisions.status==='active'` + counts of challenge findings in local state (if any) + renders copy-to-clipboard buttons using `navigator.clipboard.writeText`. No server round-trip needed for export.

## Functional Requirements
### FR-1. SHAPE — Strengthened strategy category output
The AI strategy prompt shall be extended so the 5 listed categories return structured, multi-section `content` per the following schemas (all sections within the single `content` text field, `### ` heading per section):
- PERSONALITY sections: `### Traits` (3–5, each one line with trait + short definition), `### Why each fits the audience` (1 paragraph per trait linking to audience context), `### How each should appear` (1 sentence per trait — tone / syntax / imagery guidance), `### Traits to avoid` (bulleted list of 3–5 anti-traits).
- NAMING sections: `### Territories` (3–5 territories each with `[Name]` + 1-paragraph rationale), `### Naming principles` (3–5 numbered principles for this startup), `### Example names` (2–3 listed examples per territory), `### Risks & tradeoffs` (per-territory downsides).
- TAGLINE sections: `### Direction A / B / C` (3 directions, each with the line + its `Rationale`, `Communication goal`, `Risks` sub-bullets).
- VOICE sections: `### Characteristics` (3–5 with 1-sentence definition each), `### Do` (3–5), `### Don't` (3–5), `### Sample transformation` (Before sentence + After sentence pair).
- MESSAGING sections: `### Primary message` (1 sentence), `### Supporting messages` (2–4 bulleted), `### Proof / reason to believe` (2–3 grounded in approved facts), `### CTA` (1 primary + 1 secondary), `### One-line pitch` (elevator ≤ 30 words).
- Existing `ProposedStrategyDecision` type unchanged; all extra structure lives inside the `content` string. Validation (`validateStrategyResponse`) rules unchanged.

### FR-2. VISUALIZE — Enhanced VISUAL_DIRECTION category
`VISUAL_DIRECTION.content` shall have 7 sections:
`### Logo direction & concept`, `### Typography`, `### Color mood`, `### Shape language`, `### Imagery style`, `### Composition principles`, `### Concepts to avoid`.
Each section 1–4 sentences. No actual logo/image generated — the brief text itself satisfies the requirement.

### FR-3. CHALLENGE — New stage with 8 defect detectors
New file `lib/ai/challenge.ts` implementing `runBrandCritic(activeDecisions, approvedContext)` that returns an array of challenge issues. Each issue:
- `id`, `severity: "high" | "medium" | "low"`, `affected_decision_id`, `affected_category`, `issue_title`, `issue: string`, `evidence: string`, `proposed_alternative: string`
Detectors to evaluate each decision against (AI decides which apply):
1. Clichés / generic language — e.g., "innovative platform", "seamless", "empower", "next-gen"
2. Weak differentiation — decision reads the same as any category competitor
3. Unsupported claims — statements with no supporting_context_ids / evidence
4. Audience mismatch — PERSONALITY/VOICE/MESSAGING contradicts the AUDIENCE decision
5. Contradictions — two active decisions in conflict
6. Bias / exclusion — language that excludes segments or makes ungrounded demographic assumptions
7. Weak naming — generic / unpronounceable / overcrowded-space names
8. Vague positioning — empty nouns, no category anchor
New UI tab `app/components/challenge-section.tsx` listing each issue with severity badge, affected element, issue, evidence, proposed alternative. Three action buttons per issue:
- **KEEP** → locally dismisses the issue (no server call)
- **REJECT DECISION** → calls `rejectBrandDecision` server action from `app/actions/strategy.ts` with the affected decision id → decision transitions to status=rejected
- **REVISE** → calls a "challenge re-run" server action `reviseDecisionFromChallenge` (in new `app/actions/challenge.ts`) that composes challenge guidance for the specific category and re-invokes `runStrategyAnalyst` restricted to that category (or just re-runs full generation and lets the dedup logic surface the one relevant proposed draft) — then displays the proposed revision with standard Approve/Reject buttons flowing through the existing strategy approve/reject actions.

### FR-4. CONSISTENCY GUARDIAN — 9 pair checks
New file `lib/ai/consistency.ts` implementing `runConsistencyGuardian(activeDecisionsByCategory)` that returns an array of pair results, one per required pair:
Audience ↔ Positioning, Positioning ↔ Value Proposition, Positioning ↔ Differentiation, Personality ↔ Voice, Personality ↔ Messaging, Naming ↔ Personality, Tagline ↔ Positioning, Visual Direction ↔ Personality, Launch ↔ Voice/Positioning.
Each result:
- `pair: string`, `result: "PASS" | "NEEDS REVIEW" | "CONFLICT"`, `explanation: string`, `suggested_fix: string | null`
UI rendered inside the Challenge tab as a second collapsible panel (below individual challenge issues) titled "Consistency Guardian" with 9 rows. Each row with result badge + explanation + "Suggested fix" if any. A "Suggest revision" button per CONFLICT/NEEDS-REVIEW row triggers the same revise pipeline as FR-3 REVISE.

### FR-5. DELIVER — Brand Kit with export
New tab component `app/components/deliver-section.tsx` reading ONLY `status === "active"` brand decisions. Assemble into polished editorial sections:
1. FOUNDATION (problem statement inferred from rough_idea via static render — no AI; audience; category from POSITIONING category if present)
2. POSITIONING (positioning + value proposition + differentiation + competitive angle)
3. PERSONALITY (traits + principles + traits to avoid — parsed from structured content sections)
4. NAMING (selected direction + rationale)
5. TAGLINE (selected tagline + one-line pitch from MESSAGING)
6. VOICE + MESSAGING (voice characteristics / do+don't / sample messages / message hierarchy)
7. VISUAL (logo direction / typography / color mood / shapes / imagery — parsed from structured VISUAL_DIRECTION content)
8. QUALITY (challenge results summary counters: high/medium/low from active session's challenge state OR "No challenge run yet"; consistency pass/review/conflict counters OR "No consistency check run yet"; unresolved warnings list)
9. LAUNCH (landing headline + subheadline + CTA + short product description + LinkedIn/social launch copy — parsed from LAUNCH category structured content; if missing, sensible fallback derived from other active decisions without AI)

Export capabilities (client-side clipboard only — no server dependency):
- **Copy Brand Kit (Markdown)** button — produces # / ## / ### headings for each section
- **Copy Brand Kit (JSON)** button — produces a stable object JSON (keys: foundation, positioning, personality, naming, tagline, voice_messaging, visual, quality, launch)
- Per-section "Copy this section" micro-buttons next to each section header
- If `navigator.clipboard` is unavailable, fall back to showing a readonly `<textarea>` with the content and a "Select all" notice.

### FR-6. OVERVIEW — Concise read-only dashboard
Refactor existing `app/components/overview-section.tsx` (already has rough idea / active F/I/H / priority brand decisions / recent evolution — extend to include):
- current audience (from AUDIENCE active decision — title + short content preview)
- current positioning (POSITIONING active — preview)
- current value proposition (VALUE_PROPOSITION active — preview)
- current personality preview (PERSONALITY active — traits list, parsed)
- current tagline (TAGLINE active — content)
- challenge status: "Not run" / "N issues found (H high, M medium, L low)" — passed via props from parent page (if any) OR default "Not run"
- consistency status: "Not run" / "X PASS · Y NEEDS REVIEW · Z CONFLICT" — same caveat
Challenge / consistency status live on client state via props is ideal; but if wiring requires cross-tab data flow without heavy lifting, accept "Not run" as default and show actual counts only while the user remains in the same session after running challenge/consistency from Challenge tab via lifted state (NOT required; accept Not-run default to avoid large refactor). No AI calls on Overview render.

### FR-7. WORKFLOW VISIBILITY — Stage role labels in UI
Add a subtle informational panel in the `Brand` section tab (top, below the "Brand Strategy" header) titled **AI Workflow · How this is reasoned** that lists the 7 roles as text pills with short descriptions:
1. `01 · Discovery Analyst` — Separates facts, inferences, hypotheses
2. `02 · Positioning Strategist` — Audience, positioning, value prop, differentiation
3. `03 · Brand Shaper` — Personality, naming, tagline, voice, messaging
4. `04 · Visual Strategist` — Visual brief (logo, typography, color, shapes, imagery)
5. `05 · Brand Critic` — Detects clichés, genericity, contradictions, bias
6. `06 · Consistency Guardian` — Pairwise cross-checks between brand decisions
7. `07 · Launch Strategist` — Landing copy, CTA, social launch

Pills are styled with `tracking-[0.18em]` uppercase labels and editorial dividers. Panel is static text; does not perform any state changes or calls on expand.

### FR-8. SIX-TAB NAVIGATION
Update `WorkspaceTabKey` type and `TABS` constant in `app/components/workspace-tabs.tsx` from 4 tabs to 6:
1. overview (Overview, "Read-only summary")
2. discovery (Discover, "Facts · Inferences · Hypotheses") — updated label
3. strategy (Brand, "Active brand system") — label rebrand from "Strategy"
4. challenge (Challenge, "Critique · Consistency") — NEW
5. deliver (Deliver, "Export brand kit") — NEW
6. evolution (Evolution, "Detect drift & adapt")
Update `workspace-tabs.tsx` label `tracking-[0.18em]` on hint spans. Update parent `page.tsx` to pass slots for challenge + deliver, loading active decisions / decision links as props.

### FR-9. LAUNCH STRATEGIST — Deepened LAUNCH category
In strategy prompt, specify that LAUNCH.content must include sections:
`### Landing page headline` (≤ 14 words), `### Subheadline` (≤ 30 words), `### Primary CTA` (button copy + where it goes), `### Short product description` (≤ 60 words), `### LinkedIn / social launch copy` (2 paragraphs, LinkedIn tone). This feeds the Deliver section directly.

## Non-Functional Requirements
- NFR-1. **Type safety**: No TypeScript errors after `npm run build`.
- NFR-2. **Build stability**: `next build` with Turbopack exits code 0, 0 warnings that indicate broken code (library warnings acceptable).
- NFR-3. **AI call discipline**: AI functions only invoked from server actions on explicit `<form>` submit buttons: `Analyze my idea`, `Generate strategy`, `Challenge brand`, `Check consistency`, `Analyze impact`, `Suggest revision` (per challenge issue), `Revise decision` (per consistency pair). NEVER on page load, refresh, typing, tab switch, navigation, or expanding UI.
- NFR-4. **Null & empty states**: Every component renders a graceful empty panel (label + short copy + guidance button) when there are 0 active decisions, 0 context items, no run yet, etc. No runtime crashes on `undefined.category`.
- NFR-5. **Anti-generic / traceability**: FACT ≠ INFERENCE ≠ HYPOTHESIS preserved in all supporting-context rendering. HYPOTHESIS-backed decisions still mark rationale as conditional and surface the uncertainty flag. Every important decision card has a WHY expansion (rationale + supporting context chips with type badges). WHY expansion on click only, no auto-open.
- NFR-6. **Anti-generic reference library**: Curated lightweight file `lib/ai/references/cliches-and-antipatterns.md` containing a plain-text list of banned generic phrases and anti-patterns. Strategy prompt and challenge prompt both cite snippets from this file in their system instructions (no runtime file IO — hardcode as constants). Optional file creation only if the prompt inlining is cleaner via a small const.
- NFR-7. **Design language**: Strict monochrome editorial premium aesthetic. Use Tailwind `tracking-[0.18em]` uppercase section labels, precise borders, generous whitespace, serif-light italic on key thesis phrases (as already in landing page). No gradients, neon, emoji, purple-AI look, glassmorphism, excessive rounded corners. Minimal pill-shaped buttons inherited from current components. All section headers use the same hierarchy pattern.
- NFR-8. **History preservation**: Existing Evolution supersedes pattern must continue to function unmodified. Challenge "Reject decision" transitions status to `rejected` and does not delete rows. Challenge "Revise → Approve" transitions old decision `status=superseded`, new decision `status=active`, new.supersedes_id = old.id.
- NFR-9. **Malformed AI responses**: All AI call sites have JSON extraction + validation + user-visible error messages. Provider network errors caught with explanatory copy and no server crash.
- NFR-10. **Token efficiency for AI calls**: Strategy and challenge prompts have strict token budgets. Critique iterations are MAXIMUM 1–2 per session. AI workflow has strategist → critic → improved proposal → founder review, at most one pass. No loops.

## Constraints
### Technical
- C-1. Fixed Supabase schema, 8 tables, no migrations, no new columns, no RLS changes.
- C-2. Use only existing packages. `package.json` modifications are forbidden unless no workaround exists (prohibited by default — do not add packages).
- C-3. Next.js 16.3.6 App Router with Turbopack. React 19, TypeScript strict, Tailwind v4.
- C-4. Server-side Supabase via `lib/server.ts` helpers already in `lib/db/*.ts`. All mutations through those helpers.
- C-5. AI provider abstraction via `resolveAiConfig()` from `lib/ai/discovery.ts`. New AI files import it identically.
- C-6. Gemini: `gemini-3.5-flash-lite` model, query-param API key placement, `v1beta` endpoint, system prompt prepended to user content (no native top-level system field). Other providers: existing pattern preserved in strategy.ts line-for-line (Anthropic: system field / messages array; OpenAI-family: temperature 0.2 / response_format json_object).
- C-7. `.env.local` must not be modified by this spec's implementation.

### Business
- C-8. Founder approval mandatory for every change to active decisions. No silent rewrites.
- C-9. Demo linear flow: idea → discover approve → strategy generate & approve → challenge find → revise → consistency check → deliver export → new fact evolution → compare → approve → old superseded + history visible.

### Dependencies
- C-10. All AI files depend on `resolveAiConfig` / `DiscoveryError` type already exported from `lib/ai/discovery.ts`. Do not duplicate.
- C-11. Challenge server actions depend on existing `runStrategyAnalyst` + approve/reject from `app/actions/strategy.ts`; re-export rather than duplicate.
- C-12. Deliver section parsing logic (splitting `content` by `### ` headings into sections) is a small shared helper placed alongside brand strategy component local helpers or inside a tiny standalone file if reused across Deliver + Brand + Overview. Prefer local duplication to avoid cross-coupling unless 3+ usages emerge.

## Assumptions
- A-1. The demo presenter will have a Gemini / OpenAI / etc. key inserted in `.env.local` before the live demo; the implementation builds and runs correctly with a valid key, but implementation itself never calls AI.
- A-2. The 8-table schema's lack of metadata on brand_decisions is tolerable; sectioned content with `### ` headings in the `content` string is parseable enough for UI display in Brand/Deliver/Overview sections.
- A-3. Challenge + Consistency results persisting across page refresh is NOT a hard requirement for MVP demo. Storing in React local state is acceptable. If the user refreshes, they re-run challenge/consistency.
- A-4. The "Why this changed" rationale for Evolution proposed revisions continues to be grounded in approved context.
- A-5. The user is on Windows / npm as already established; `npm run build` runs via PowerShell.

## Open Questions
None at spec time. All ambiguous scope is resolved by NFR "Do not rebuild working features" + "minimum changes necessary" (so reuse is the default when either path works).

## Acceptance Criteria
### AC-1: SHAPE categories have structured output in content
- **Type**: `rule`
- **Given**: an approved FACT/HYPOTHESIS/INFERENCE context exists and "Generate strategy" is submitted
- **When**: runStrategyAnalyst returns proposed decisions for PERSONALITY / NAMING / TAGLINE / VOICE / MESSAGING
- **Then**: the `content` string for each category contains at least 4 distinct `### ` headings matching the required section names for that category
- **Pass Condition**: Strategy prompt text in `lib/ai/strategy.ts` SYSTEM_PROMPT explicitly lists each required section by name for each of the 5 SHAPE categories, and validateStrategyResponse still accepts the content (no length filter breaks the new multi-section text — verify the `slice(0, 2000)` cap is raised if needed per category content length expectations).
- **Evidence**: Source inspection of `lib/ai/strategy.ts` SYSTEM_PROMPT lines.

### AC-2: VISUAL_DIRECTION has 7 brief sections
- **Type**: `rule`
- **Given**: approved context exists covering positioning / personality / differentiation
- **When**: strategy is generated and includes a VISUAL_DIRECTION decision
- **Then**: the `content` string has 7 `### ` sections with the required names (Logo direction & concept / Typography / Color mood / Shape language / Imagery style / Composition principles / Concepts to avoid)
- **Pass Condition**: SYSTEM_PROMPT explicitly enumerates these 7 section headings with 1–4 sentence guidance for each.
- **Evidence**: `lib/ai/strategy.ts` SYSTEM_PROMPT lines specifying VISUAL_DIRECTION sections.

### AC-3: LAUNCH category produces 5 launch sections
- **Type**: `rule`
- **Given**: same as AC-1
- **When**: a LAUNCH decision is generated
- **Then**: content contains 5 sections: Landing page headline / Subheadline / Primary CTA / Short product description / LinkedIn or social launch copy
- **Pass Condition**: SYSTEM_PROMPT explicitly names these 5 sections for LAUNCH.content
- **Evidence**: `lib/ai/strategy.ts` SYSTEM_PROMPT lines for LAUNCH category

### AC-4: Challenge stage is visible in navigation & can critique decisions
- **Type**: `rule`
- **Given**: at least one status=active brand decision exists
- **When**: the user navigates to the "Challenge" tab and clicks "Challenge active brand decisions"
- **Then**: (1) the form submits to a server action; (2) the Brand Critic AI call is made only on submit (never on load); (3) the returned issues each render severity / affected element / issue / evidence / proposed alternative + KEEP / REJECT / REVISE buttons
- **Pass Condition**: WorkspaceTabs list includes challenge tab; challenge section component renders buttons bound to 3 distinct handlers; server action `reviseDecisionFromChallenge` exists and returns new proposed decisions.
- **Evidence**: `workspace-tabs.tsx` TABS constant; `challenge-section.tsx` renders `<form>` buttons for all three actions.

### AC-5: Challenge REJECT decision flows through approve pipeline
- **Type**: `rule`
- **Given**: an active decision D and a challenge issue I targeting D
- **When**: founder clicks "REJECT DECISION" button for issue I and form submits
- **Then**: server calls `rejectBrandDecision(D.id)` and after revalidation, D.status === "rejected" in a fresh DB read; D row remains in table (not deleted)
- **Pass Condition**: form hidden fields include `decisionId` and action binds to a server action that wraps the existing reject helper
- **Evidence**: Source inspection of the new server action in `app/actions/challenge.ts`; call to `rejectBrandDecision` from `lib/db/brand-decisions.ts`

### AC-6: Consistency Guardian cross-checks 9 pairs
- **Type**: `rule`
- **Given**: active decisions exist for 9+ relevant categories
- **When**: founder clicks "Run consistency check" on the Challenge tab
- **Then**: returns 9 results exactly (one per listed pair), each with result ∈ {PASS, NEEDS REVIEW, CONFLICT}, explanation, and null-or-better suggested_fix
- **Pass Condition**: `lib/ai/consistency.ts` has a 9-element PAIRS constant; validateConsistencyResponse checks all 9 are present; UI rows iterate all 9.
- **Evidence**: Source of `lib/ai/consistency.ts` PAIRS constant with 9 named pairs.

### AC-7: Deliver Brand Kit renders 9 sections with copy buttons
- **Type**: `rule`
- **Given**: AUDIENCE / POSITIONING / VALUE_PROPOSITION / DIFFERENTIATION / PERSONALITY / NAMING / TAGLINE / VOICE / MESSAGING / VISUAL_DIRECTION / LAUNCH each have at least one active decision
- **When**: Deliver tab is rendered
- **Then**: 9 sections (Foundation / Positioning / Personality / Naming / Tagline / Voice+Messaging / Visual / Quality / Launch) render; Copy-Markdown and Copy-JSON top-level buttons render; per-section copy button exists for each section header
- **Pass Condition**: deliver-section.tsx renders 9 `<section>` elements with data-testid-like class names; top-level buttons have distinct click handlers calling `navigator.clipboard.writeText`.
- **Evidence**: Source structure of `app/components/deliver-section.tsx`.

### AC-8: Workspace navigation has 6 tabs, no crashes on empty sections
- **Type**: `rule`
- **Given**: a freshly created startup with zero context/decisions (right after landing page submit)
- **When**: user clicks every tab in sequence, collapses/expands WHY panels, runs challenge with no active decisions
- **Then**: no tab crashes, each has an empty-state panel with guidance, TS build has no errors
- **Pass Condition**: tabs array in workspace-tabs.tsx has length 6; every section component has a len===0 empty branch for each of its sub-panels.
- **Evidence**: `workspace-tabs.tsx` TABS.length === 6; each section component renders an empty state `<div>` when arrays are empty.

### AC-9: Overview shows 8 required read-only fields
- **Type**: `rule`
- **Given**: full set of active decisions from a finished demo
- **When**: Overview tab renders
- **Then**: visible read-only fields for: (1) rough idea, (2) active FACT count / INFERENCE count / HYPOTHESIS count, (3) audience preview, (4) positioning preview, (5) value proposition preview, (6) personality preview (traits), (7) tagline, (8) recent evolution (change analyses list). Challenge status and consistency status display either actual counts or "Not run" placeholder.
- **Pass Condition**: overview-section.tsx renders 8 headings/labels for each of these with content
- **Evidence**: Source of `app/components/overview-section.tsx`.

### AC-10: AI Workflow panel visible in Brand section
- **Type**: `rule`
- **Given**: user navigates to Brand tab
- **When**: page is rendered (without any button clicks)
- **Then**: an "AI Workflow · How this is reasoned" panel displays 7 role pill rows (01–07) with correct labels
- **Pass Condition**: brand-strategy-section.tsx renders 7 workflow pill divs before the strategy generator area.
- **Evidence**: Source of `app/components/brand-strategy-section.tsx`.

### AC-11: Build passes 0 TypeScript + 0 build errors
- **Type**: `rule`
- **Given**: all spec implementation complete
- **When**: `npm run build` runs
- **Then**: exit code 0, TypeScript prints "Finished TypeScript", static pages generated, 0 lines with "error TS" or "Error: Export" messages
- **Pass Condition**: exit === 0 && no TS errors in stdout
- **Evidence**: terminal build log captured at end of tasks.

### AC-12: History preserved on challenge-revised approval
- **Type**: `rule`
- **Given**: challenge REVISE produces a new proposed decision D_new targeting the same category as an existing active decision D_old
- **When**: founder approves D_new via standard Approve button on Strategy proposed list
- **Then**: D_old.status === "superseded"; D_new.status === "active"; D_new.supersedes_id === D_old.id; both rows remain present in DB
- **Pass Condition**: the standard approveBrandDecision helper already handles supersession correctly when category already has active → existing behavior preserved. No new code needed; regression test only by source inspection of the `approveBrandDecision` path in `lib/db/brand-decisions.ts` to confirm it still sets status=superseded on existing category active siblings on approve.
- **Evidence**: Source lines in `lib/db/brand-decisions.ts` that mark old decisions superseded when approving a new decision in the same category.

### AC-13: No AI calls on navigation/load/typing/expand
- **Type**: `rule`
- **Given**: a full workspace page
- **When**: page first renders, user switches tabs, types into textarea, expands WHY panel, refreshes page, navigates with browser back/forward
- **Then**: no network fetch to any of `/generativelanguage.googleapis.com`, `api.openai.com`, `api.anthropic.com`, `openrouter.ai` is made
- **Pass Condition**: all AI call sites (`runDiscoveryAnalysis`, `runStrategyAnalyst`, `runChangeAnalysis`, new `runBrandCritic`, new `runConsistencyGuardian`) are invoked ONLY from inside server actions that are form `action=` attributes, never from inside `useEffect`, never from inside component bodies, never from inside expand handlers.
- **Evidence**: grep for the AI function names and confirm they only appear inside server action files (`app/actions/*.ts`) and the calling server files (not client components).

### AC-14: Decision WHY expansion still shows rationale + supporting context
- **Type**: `rule`
- **Given**: an active decision with rationale + 2+ supporting_context_ids
- **When**: user clicks "Show why"
- **Then**: expanded panel renders Rationale block AND supporting context chips with correct type badges (FACT/INFERENCE/HYPOTHESIS) — not just the rationale
- **Pass Condition**: brand-strategy-section ActiveDecisionCard component still imports links, computes supporting set per decision, renders chip list on expand.
- **Evidence**: source lines of `ActiveDecisionCard` in brand-strategy-section.tsx.

### AC-15: Premium editorial design quality
- **Type**: `rubric`
- **Dimension**: Monochrome editorial design fidelity across the new and changed UI surfaces
- **Scale**: 1-5
- **Anchors**:
  - 1 = New sections diverge from current design language (gradients, emoji, rounded corners, random colors appear); section headings inconsistent levels
  - 3 = Mostly consistent but a few areas miss tracking-[0.18em] convention or use overly-rounded cards or purple-accented badges where not severity-related
  - 5 = Every new section (Brand workflow panel, Challenge tab, Deliver tab, updated Overview, expanded tabs) strictly follows current established conventions: uppercase tracking-[0.18em] section labels; precise 1px borders border-border; rounded-2xl outer cards rounded-xl inner cards; no new accent colors introduced beyond existing emerald/amber/destructive for severity; whitespace generous; consistent h2→h3→h4 heading hierarchy per section; serif italic where thesis-style copy used
- **Pass Threshold**: >= 4
- **Evidence**: Visual source audit of all class names in new files.

### AC-16: AI workflow chain integrity (stages see relevant prior output)
- **Type**: `rubric`
- **Dimension**: Quality and correctness of information handoff between AI stages
- **Scale**: 1-5
- **Anchors**:
  - 1 = Each AI call re-starts from rough idea only; no prior approved decisions forwarded
  - 3 = Most prompts include approved context + existing active decisions; a few stages only get raw idea
  - 5 = Every stage prompt: Strategy gets approved context + existing active decisions; Brand Critic gets active decisions text + their supporting context; Consistency gets all active decisions by category map; Challenge revise re-scaffolds the critique text into the guidance. Critique max 1 iteration (no loop).
- **Pass Threshold**: >= 4
- **Evidence**: source of userPrompt/body in lib/ai/*.ts for each new stage; inspect data forwarding.
