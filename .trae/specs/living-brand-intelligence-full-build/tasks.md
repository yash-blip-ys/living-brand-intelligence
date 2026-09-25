# Living Brand Intelligence — Full Product Build
## Implementation Plan

Status-Specific Fields conventions:
- Status: `pending` / `in_progress` / `blocked` / `completed` / `cancelled`

---

## Task 1: Infrastructure — expand workspace tabs to 6 and wire server data
- **Status**: `pending`
- **Priority**: high
- **Depends On**: None
- **Description**:
  - Expand `WorkspaceTabKey` type in `app/components/workspace-tabs.tsx` to include `challenge` and `deliver` keys; add 2 entries to `TABS` constant (total 6). Update hint spans tracking-widest → tracking-[0.18em] for consistency.
  - Update `app/startups/[startupId]/page.tsx` to:
    - Pass `challenge` slot: new ChallengeSection (to be built in Task 5) with props: startupId, approvedContext, activeDecisions, decisionLinks
    - Pass `deliver` slot: new DeliverSection (Task 6) with props: startup name, rough idea, activeDecisions, decisionLinks, approvedContext
  - Ensure page.tsx imports for challenge/deliver sections resolve (add as TODO imports initially; TS will error until tasks 5-6 complete which is fine — we will build them before build step).
- **Acceptance Criteria Addressed**: AC-8, AC-11
- **Test Requirements**:
  - `rule` TR-1.1: `TABS.length === 6` after edit; workspace-tabs.tsx exports `WorkspaceTabKey` containing "challenge" | "deliver"
    Evidence: grep TABS constant and union type.
  - `rule` TR-1.2: page.tsx slots object has entries for all 6 keys with matching JSX components (no undefined / null slots)
    Evidence: source inspection of `slots={{...}}` object in page.tsx.

---

## Task 2: SHAPE — strengthen strategy AI prompt for 5 categories
- **Status**: `pending`
- **Priority**: high
- **Depends On**: Task 1
- **Description**:
  - Edit `lib/ai/strategy.ts` SYSTEM_PROMPT (lines 67–102) to replace bullet 8–10 style advice for PERSONALITY / NAMING / TAGLINE / VOICE / MESSAGING with detailed, explicit section-by-section instructions using the `### ` heading convention. Match the section names verbatim from spec FR-1.
  - Raise content slice cap from `slice(0, 2000)` to `slice(0, 5000)` in `validateStrategyResponse` (line 154) because structured multi-section content is longer. Keep rationale cap at 2000 unchanged.
  - Update the 11-category allowed list description to emphasize: PERSONALITY, NAMING, TAGLINE, VOICE, MESSAGING, VISUAL_DIRECTION, and LAUNCH categories *must* use `### ` section headings.
  - Do not modify type definitions.
- **Acceptance Criteria Addressed**: AC-1, AC-16
- **Test Requirements**:
  - `rule` TR-2.1: SYSTEM_PROMPT file contains exact section headings for PERSONALITY (Traits / Why each fits / How each appears / Traits to avoid), NAMING (Territories / Naming principles / Example names / Risks & tradeoffs), TAGLINE (Direction A / Direction B / Direction C each with Rationale / Communication goal / Risks), VOICE (Characteristics / Do / Don't / Sample transformation), MESSAGING (Primary message / Supporting messages / Proof / reason to believe / CTA / One-line pitch)
    Evidence: grep of "### Traits", "### Territories", "### Direction A", "### Characteristics", "### Primary message" (or more) in lib/ai/strategy.ts.
  - `rule` TR-2.2: validateStrategyResponse content slice cap >= 4000 chars
    Evidence: source line with content slice call.
  - `rubric` TR-2.3: Prompt chain integrity for strategy stage. Scale: 1-5. Anchors: 1 = prompt only forwards rough idea, 3 = prompt forwards approved context ids and existing active decisions, 5 = prompt forwards approved context + ids + existing active decisions + anti-generic cliché references inline. Threshold >= 4.
    Evidence: inspection of userPrompt text in runStrategyAnalyst.

---

## Task 3: VISUALIZE + LAUNCH — extend 2 more strategy category prompts
- **Status**: `pending`
- **Priority**: high
- **Depends On**: Task 2
- **Description**:
  - Extend SYSTEM_PROMPT in `lib/ai/strategy.ts` for VISUAL_DIRECTION to enumerate 7 sections (Logo direction & concept, Typography, Color mood, Shape language, Imagery style, Composition principles, Concepts to avoid), each 1–4 sentences, no generated assets.
  - Extend SYSTEM_PROMPT for LAUNCH to enumerate 5 sections: Landing page headline (≤14 w), Subheadline (≤30 w), Primary CTA, Short product description (≤60 w), LinkedIn/social launch copy (2 paras). Word counts guidance to AI only (no server enforcement needed).
- **Acceptance Criteria Addressed**: AC-2, AC-3
- **Test Requirements**:
  - `rule` TR-3.1: SYSTEM_PROMPT contains all 7 VISUAL section headings explicitly.
    Evidence: exact match grep for 7 literal heading strings.
  - `rule` TR-3.2: SYSTEM_PROMPT contains all 5 LAUNCH section headings.
    Evidence: exact match grep for 5 literal heading strings.

---

## Task 4: AI backend for Challenge + Consistency Guardian
- **Status**: `pending`
- **Priority**: high
- **Depends On**: Task 3
- **Description**:
  - Create `lib/ai/challenge.ts`:
    - Reuse existing provider pattern EXACTLY from `strategy.ts` lines 273–486 (4 provider branches: anthropic / gemini / openai-family). Replace SYSTEM_PROMPT and userPrompt only.
    - Export: `runBrandCritic(activeDecisions: {id, category, title, content, rationale, supporting_context_ids}[], approvedContext: {id, type, content}[]): Promise<{ok:true; result:{issues: ChallengeIssue[]}} | {ok:false; err:DiscoveryError}>`
    - `ChallengeIssue = {id:string, severity:"high"|"medium"|"low", affected_decision_id:string, affected_category:BrandDecisionCategory, issue_title:string, issue:string, evidence:string, proposed_alternative:string}`
    - SYSTEM_PROMPT specifies 8 detectors by name: clichés/generic, weak differentiation, unsupported claims, audience mismatch, contradictions, bias/exclusion, weak naming, vague positioning. Each returned issue MUST have all 8 fields. Include snippets of anti-generic clichés list (innovative platform/seamless/empower users/next-generation/etc.) inline.
    - Validate function similar to `validateStrategyResponse`.
  - Create `lib/ai/consistency.ts`:
    - Same provider pattern.
    - `PAIRS` constant with 9 exact pair strings as spec FR-4.
    - Export `runConsistencyGuardian(decisionsByCategory: Map<BrandDecisionCategory, BrandDecision[]>): Promise<{ok:true; result:{pair_results: ConsistencyPairResult[]}} | {ok:false; err}>`
    - `ConsistencyPairResult = {pair:string, result:"PASS"|"NEEDS REVIEW"|"CONFLICT", explanation:string, suggested_fix:string|null}`
    - SYSTEM_PROMPT mandates all 9 pairs returned exactly; missing pair ⇒ parse failure; synthesize PASS if AI omits a pair with missing decisions.
  - Both files import `resolveAiConfig`, `DiscoveryError`, and `isRecord`/`findJson` helpers (reimplement small helpers locally to avoid import coupling if easier; or re-export from existing — prefer local reimplementation since they are ~10 lines each).
- **Acceptance Criteria Addressed**: AC-4, AC-6, AC-13, AC-16
- **Test Requirements**:
  - `rule` TR-4.1: challenge.ts exports `runBrandCritic` with correct argument arity; it contains provider dispatch for 4 branches.
    Evidence: file grep for anthropic/gemini/openrouter/api.openai.
  - `rule` TR-4.2: consistency.ts `PAIRS` array has length 9 covering all specified pairs.
    Evidence: `PAIRS.length === 9` assertion by source inspection.
  - `rule` TR-4.3: No client-side imports of challenge.ts or consistency.ts from "use client" files (they are server-only libs for server action usage).
    Evidence: grep imports in app/components/ — no references.
  - `rubric` TR-4.4: AI prompt chain quality for Critic/Consistency. Scale 1-5. Anchors: 1 = no decisions forwarded; 3 = Critic receives active decision text only, Consistency gets decisions text; 5 = Critic receives active decisions + supporting context items content (FACT/INFERENCE/HYPOTHESIS labels) + list of generic clichés inline, Consistency receives decisions mapped by category so it sees full category text. Threshold >= 4.
    Evidence: userPrompt text inspection in both files.

---

## Task 5: Challenge server actions + Challenge section component
- **Status**: `pending`
- **Priority**: high
- **Depends On**: Task 4
- **Description**:
  - Create `app/actions/challenge.ts` ("use server") exporting:
    - `runChallengeCritique(state, formData)`: wraps getStartup / getBrandDecisions / getContextItems → filter active → call runBrandCritic → return `{issues?: ChallengeIssue[], error?: string, configError?: boolean}` serialized into state.
    - `dismissChallengeIssue(state, formData)`: pure server-side passthrough (no DB call needed; dismiss handled client state). Return `{dismissedIssueId: string}` so client updates state.
    - `rejectDecisionFromChallenge(state, formData)`: reads decisionId from formData, calls existing `rejectBrandDecision` helper from `lib/db/brand-decisions.ts`, revalidates path `/startups/[startupId]`.
    - `reviseDecisionFromChallenge(state, formData)`: reads `startupId`, `affectedCategory`, `challengeGuidance`, plus decisionId; then calls the strategy pipeline like `runStrategyGeneration` does — getStartup, getContextItems, filter approved context, get existing active decisions (filtered to exclude the one being revised), call `runStrategyAnalyst` with the rough idea + approved context + updated existing list, but append a chunk to userPrompt: `ADDITIONAL CRITIQUE GUIDANCE FROM BRAND CRITIC FOR CATEGORY <CAT>: "...challengeGuidance... Re-consider this category with the critique in mind. Return a single category decision if possible."` Then persist the returned proposed decision using standard createBrandDecisions as status=proposed, and return state with `{proposed: ProposedDecisionDraft[]}` matching the strategy action state shape.
  - Create `app/components/challenge-section.tsx` ("use client"):
    - Props: startupId, approvedContext, activeDecisions (BrandDecision[]), decisionLinks
    - Top area: label "Challenge · Brand Critic" (tracking-[0.18em]), short copy: "Review active brand decisions for clichés, contradictions, bias, unsupported claims, weak differentiation, vague positioning, and weak naming."
    - Sub-heading: "Consistency Guardian" with short copy: "Cross-check all pairs for alignment and internal consistency."
    - Two form submit buttons: (1) "Challenge active brand decisions" bound to `runChallengeCritique` useFormState; (2) "Run consistency check" bound to a new `runConsistencyCheck` action exported from `app/actions/challenge.ts` (add it: wraps getStartup / getBrandDecisions → build map by category → call runConsistencyGuardian → return `{pair_results?:..., error?:..., configError?:boolean}`).
    - Render issues: severity badge (low/medium/high with emerald/amber/destructive existing colors), affected category + decision title, issue text, evidence block (as border-left-muted paragraph), proposed alternative block. Three forms per issue with buttons: `KEEP` (call dismiss action, remove from local list), `REJECT DECISION` (call rejectDecisionFromChallenge with decisionId), `SUGGEST REVISION` (call reviseDecisionFromChallenge with formData fields: category + challengeGuidance = issue+evidence concatenated + affectedDecisionId + startupId → on return, if state.proposed array populated, display a proposed-decision preview card at the top of the page routing user to Brand tab with a note).
    - Render consistency results below issues in separate card: 9 rows, each with pair name badge (PASS / NEEDS REVIEW / CONFLICT), explanation, suggested_fix (if CONFLICT or NEEDS REVIEW) + small "Suggest revision" button that calls reviseDecisionFromChallenge for relevant category.
    - Empty states: if 0 active decisions → show state panel: "No active brand decisions yet. Generate strategy in the Brand tab, approve a few, then return here to challenge." If AI not configured → show configError panel reused from existing pattern.
- **Acceptance Criteria Addressed**: AC-4, AC-5, AC-6, AC-8, AC-13
- **Test Requirements**:
  - `rule` TR-5.1: `app/actions/challenge.ts` exports all 5 server actions (runChallengeCritique, dismissChallengeIssue, rejectDecisionFromChallenge, reviseDecisionFromChallenge, runConsistencyCheck) as "use server".
    Evidence: grep exports.
  - `rule` TR-5.2: challenge-section.tsx component instantiates 2 useFormState (challenge + consistency) and renders 3 buttons per issue (KEEP/REJECT/SUGGEST REVISION) when issues array populated.
    Evidence: component source.
  - `rule` TR-5.3: rejectDecisionFromChallenge calls `rejectBrandDecision` helper directly from lib/db/brand-decisions.ts (not a reimplementation).
    Evidence: import line + function body call.
  - `rubric` TR-5.4: Editorial design for challenge section. Scale 1-5, same anchors AC-15, threshold >= 4.
    Evidence: component class audit.

---

## Task 6: Deliver section + Brand Kit export
- **Status**: `pending`
- **Priority**: high
- **Depends On**: Task 5
- **Description**:
  - Create `app/components/deliver-section.tsx` ("use client"):
    - Props: startupName, roughIdea, activeDecisions (only status==='active' pre-filtered or filtered internally), decisionLinks, approvedContext.
    - Top level: "Brand Kit · Deliver" header with uppercase tracking-[0.18em] label, copy: "All approved decisions assembled into a launch-ready brand kit. Export via clipboard as Markdown or structured JSON."
    - Two top buttons: `Copy Brand Kit (Markdown)` and `Copy Brand Kit (JSON)`, disabled if navigator.clipboard undefined → show fallback textarea instead.
    - 9 sections as FR-5, each with section header + "Copy section" mini-button:
      1. FOUNDATION:
         - Problem: inferred from roughIdea (static extraction: display first 2 sentences of raw idea as problem statement; no AI).
         - Audience decision.content (if any active AUDIENCE).
         - Category: extracted from POSITIONING decision.content if contains a category sentence.
      2. POSITIONING: content from POSITIONING, VALUE_PROPOSITION, DIFFERENTIATION (and any LAUNCH competitive angle hint parsed from LAUNCH).
      3. PERSONALITY: parse structured sections from PERSONALITY.content by splitting on `### `, render each sub-heading block.
      4. NAMING: parse NAMING sections (Territories / Principles / Examples / Risks). Label "Selected direction + rationale" as per spec FR-5 DELIVER.
      5. TAGLINE: show tagline content (parsed Direction A/B/C sections) + "One-line pitch" from MESSAGING parsed `### One-line pitch` section text.
      6. VOICE + MESSAGING: merge VOICE sections + MESSAGING sections hierarchically.
      7. VISUAL: 7 VISUAL_DIRECTION sections.
      8. QUALITY: summary counters for challenge issues and consistency results (if any are available via optional prop from parent; default "Not run" labels). List unresolved warnings as cards.
      9. LAUNCH: headline, subheadline, CTA, short description, social copy from LAUNCH category sections parsed.
    - Implement per-section copy helpers: for Markdown, assemble `#` headings with string interpolation; for JSON assemble typed object `{foundation:{problem, audience, category}, positioning:{...}, personality:{...}, naming:{...}, tagline:{...}, voice_messaging:{...}, visual:{...}, quality:{challenge_summary:{high,medium,low,not_run}, consistency_summary:{pass,needs_review,conflict,not_run}, unresolved_warnings:string[]}, launch:{headline, subheadline, cta, short_description, social_copy}}`. If sections missing from decisions, JSON value `null`.
    - Content parser helper: small local `function parseSections(content: string): Record<string, string>` that splits by `/^### /mg`, trims keys, returns map. Reuse this helper across Personality/Naming/Tagline/Voice/Messaging/Visual/Launch rendering.
- **Acceptance Criteria Addressed**: AC-7
- **Test Requirements**:
  - `rule` TR-6.1: component renders 9 `<section>` blocks (use distinct class `data-section`-style or labeled divs — any unique marker readable in source), each has a clickable "Copy section" element.
    Evidence: source inspection of deliver-section.tsx render function.
  - `rule` TR-6.2: top-level `Copy Brand Kit (Markdown)` and `Copy Brand Kit (JSON)` buttons each have `onClick` handlers calling different helpers (different functions); one assembles `# Section\n\n` markdown, other calls `JSON.stringify(kit, null, 2)`.
    Evidence: function bodies of handlers.
  - `rule` TR-6.3: parseSections helper returns correct keyed map for a test string. Verify: parseSections("### A\na text\n### B\nb text") returns map {A:"a text", B:"b text"} via static reading of logic (split regex logic sanity).
    Evidence: source of parseSections function.
  - `rubric` TR-6.4: Editorial layout quality of deliver kit. Scale 1-5, threshold >= 4 (anchors as AC-15).
    Evidence: component class names / structure audit.

---

## Task 7: Overview + Brand section polish (workflow panel + structured parsing)
- **Status**: `pending`
- **Priority**: medium
- **Depends On**: Task 6
- **Description**:
  - A. In `app/components/brand-strategy-section.tsx`:
    - Add static "AI Workflow · How this is reasoned" info panel at top (below Brand header) with 7 numbered role pills as specified FR-7 / AC-10. Use existing tracking-[0.18em]/uppercase convention.
    - For ActiveDecisionCard rendering of PERSONALITY / NAMING / TAGLINE / VOICE / MESSAGING / VISUAL_DIRECTION / LAUNCH decisions: enhance the body content display by splitting content via `### ` sections (reuse parseSections-like helper local to this file) and rendering sub-headings. If content has no `### ` headings (legacy decisions, or categories like AUDIENCE that don't require sections), fall back to the current plain paragraph rendering. This avoids showing a wall-of-text for rich shaped categories.
  - B. In `app/components/overview-section.tsx`:
    - Add derived display fields: audiencePreview (from AUDIENCE.active, truncate 120 chars), positioningPreview, valuePreview, personalityTraitsPreview (parse PERSONALITY content for "### Traits", extract first ~3 traits, comma-joined), taglinePreview (TAGLINE active parsed Direction A).
    - Add optional props (with default "Not run" text) for `challengeStatusLabel?: string` and `consistencyStatusLabel?: string`. If parent page.tsx doesn't pass actual counts, default applies.
  - No schema / props breaking changes to existing interface.
- **Acceptance Criteria Addressed**: AC-9, AC-10, AC-14
- **Test Requirements**:
  - `rule` TR-7.1: brand-strategy-section renders 7 workflow pills (01-07 each with correct role label).
    Evidence: source grep for each role literal.
  - `rule` TR-7.2: overview-section renders 8 distinct headline labels (Rough Idea / Active Context counts / Audience / Positioning / Value / Personality / Tagline / Recent Evolution) or equivalent 8 items as specified AC-9's 8-required list (count challenge/consistency status as bonus beyond the baseline 8).
    Evidence: section heading elements in render.
  - `rule` TR-7.3: ActiveDecisionCard still invokes WHY expansion with both rationale block and supporting context chips (no regression).
    Evidence: brand-strategy-section "Show why" expanded JSX renders both rationale + chips.

---

## Task 8: Reliability pass — empty states + imports + dead code cleanup
- **Status**: `pending`
- **Priority**: medium
- **Depends On**: Task 7
- **Description**:
  - In every new section component (challenge-section, deliver-section), add empty-state panels for edge cases:
    - challenge-section: no active decisions → show CTA to generate strategy in Brand tab; no issues returned → show "Brand looks clean. No critical issues found, but this is not a guarantee — always use founder judgment."
    - deliver-section: no active decisions → empty state: "Brand kit is empty. Approve some active decisions in the Brand tab first."
  - In existing sections: verify evolution-section.tsx and discovery-section.tsx already have len===0 branches (already yes from prior polish); confirm no `undefined.category` access on arrays that can be empty by checking map/filter always guards with `if` or `.length`.
  - Import sanity: verify no circular imports, no stray `console.log` debug statements, no unused vars (TS will catch unused vars with strict setting at build).
  - Update any `tracking-widest` remaining in new files to `tracking-[0.18em]`.
  - Ensure `use client` and `"use server"` directives are correctly placed at top of files FIRST LINE (actions/* files need "use server" on line 1; components client-only need "use client" line 1).
- **Acceptance Criteria Addressed**: AC-8, AC-11, AC-15
- **Test Requirements**:
  - `rule` TR-8.1: challenge-section and deliver-section each contain at least one empty-state branch conditional rendered.
    Evidence: render return contains conditional with length===0 or similar.
  - `rule` TR-8.2: All new files' directives correct ("use server" for actions; "use client" for client components), line 1 of file.
    Evidence: first-line inspection.

---

## Task 9: Build verification + iterative fixes until zero errors
- **Status**: `pending`
- **Priority**: high
- **Depends On**: Task 8
- **Description**:
  - Run `npm run build` in project root.
  - For any TS/build errors encountered: fix with minimal, surgical edits; re-run build iteratively until exit 0 with 0 TS errors and 0 build errors.
  - Known likely errors to be vigilant about:
    - unused imports in challenge/deliver components → remove unused.
    - workspace-tabs.tsx WorkspaceTabKey type expanded but page.tsx slots object missing keys → fixed in Task 1.
    - Missing return types on server action functions → TS will flag, add explicit Promise<ReturnType>.
    - Decision category union type non-exhaustive switch → add default case.
- **Acceptance Criteria Addressed**: AC-11
- **Test Requirements**:
  - `rule` TR-9.1: `npm run build` terminal output has exit code 0; contains line "Finished TypeScript" without preceding lines containing "error TS" or "Error: Export"
    Evidence: terminal log attached as Completion Evidence.
  - `rule` TR-9.2: No task-local TRs fail. All rules from Tasks 1-8 are passing via source inspection in the final post-build file state. Self-verify each rule TR, record pass.
    Evidence: TR checklist in each task's Completion Evidence block.
  - `rubric` TR-9.3: Overall design coherence across 6 tabs. Scale 1-5 (anchors AC-15), threshold >= 4.
    Evidence: cross-file review of all component section header label classes.
  - `rubric` TR-9.4: Overall prompt chain quality across 7 stages. Scale 1-5 (anchors AC-16), threshold >= 4.
    Evidence: cross-file review of all lib/ai/* userPrompt text fields for forwarding of prior stage output.
