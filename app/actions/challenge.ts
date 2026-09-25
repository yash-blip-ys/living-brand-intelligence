"use server";

import { revalidatePath } from "next/cache";
import { getStartup } from "@/lib/db/startups";
import { getContextItems } from "@/lib/db/context";
import {
  getBrandDecisions,
  rejectBrandDecision,
  createBrandDecisions,
  createDecisionContextLinks,
  getDecisionContextLinks,
  type NewDecisionContextLinkInput,
} from "@/lib/db/brand-decisions";
import type { ChallengeIssue } from "@/lib/ai/challenge";
import type { BrandCheck } from "@/lib/ai/brand-checks";
import { type ConsistencyPairResult } from "@/lib/ai/consistency";
import {
  orchestrateConsistency,
  orchestrateCritique,
  orchestrateStrategyGeneration,
} from "@/lib/ai/orchestration";
import type { BrandEvaluation, BrandEvaluationEvidence } from "@/lib/ai/evaluation/evaluator";
import type { BrandDecision, ContextItem, BrandDecisionCategory } from "@/lib/types/database";
import {
  type ProposedDecisionDraft,
  type StrategyActionState,
  toDrafts,
  filterActiveApprovedContext,
} from "@/app/actions/strategy";
import type { StrategyResult } from "@/lib/ai/strategy";

export type ChallengeCritiqueState = {
  error?: string;
  configError?: boolean;
  issues?: ChallengeIssue[] | null;
  /** Full five-check result, including PASS and INSUFFICIENT_EVIDENCE. */
  checks?: BrandCheck[] | null;
  evaluations?: BrandEvaluation[] | null;
  evaluationError?: string | null;
  referenceIds?: string[];
  dismissedIssueIds?: string[];
  revisedDecisionDraftId?: string | null;
  revised?: ProposedDecisionDraft[] | null;
};

export type ConsistencyCheckState = {
  error?: string;
  configError?: boolean;
  pair_results?: ConsistencyPairResult[] | null;
  evaluations?: BrandEvaluation[] | null;
  evaluationError?: string | null;
  referenceIds?: string[];
  revisedDecisionDraftId?: string | null;
  revised?: ProposedDecisionDraft[] | null;
};

export type ChallengeDismissState = {
  error?: string;
  dismissedIssueId?: string;
};

export type ChallengeReviseState = StrategyActionState;

/**
 * Applies the alternative the critic already wrote, with no second model call.
 * It becomes a proposed draft like any other revision, so the founder still
 * approves it explicitly in the Brand tab — nothing is written silently.
 */
export async function useChallengeAlternative(
  _state: StrategyActionState | undefined,
  formData: FormData,
): Promise<StrategyActionState> {
  const startupId = formData.get("startupId")?.toString() ?? "";
  const decisionId = formData.get("decisionId")?.toString() ?? "";
  const categoryRaw = formData.get("category")?.toString() ?? "";
  const alternative = formData.get("alternative")?.toString() ?? "";
  if (!startupId || !decisionId || !categoryRaw || !alternative.trim()) {
    return { error: "Startup ID, decision, category, and alternative are required." };
  }
  let decisions: BrandDecision[] = [];
  try {
    decisions = await getBrandDecisions(startupId);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not load decisions.";
    return { error: message };
  }
  const target = decisions.find((d) => d.id === decisionId);
  if (!target) return { error: "The challenged decision no longer exists." };

  const draft: ProposedDecisionDraft = {
    tempId: `alt_${Date.now().toString(36)}`,
    category: (categoryRaw.toUpperCase() as BrandDecisionCategory) ?? target.category,
    title: target.title,
    content: alternative.trim(),
    rationale:
      "Applied the Brand Critic's proposed alternative. Review the wording before approving.",
    supporting_context_ids: [],
    uncertainty: "Written by the Brand Critic, not regenerated from Discovery context.",
    persisted: false,
    persistedId: null,
    state: "proposed",
  };
  return { proposed: [draft] };
}

const EMPTY_CRITIQUE: ChallengeCritiqueState = {};
const EMPTY_DISMISS: ChallengeDismissState = {};

type DecisionLinks = Awaited<ReturnType<typeof getDecisionContextLinks>>;

function buildEvaluationMaps(
  decisionIds: readonly string[],
  links: DecisionLinks,
  approved: readonly ContextItem[],
): {
  evidenceByDecisionId: Record<string, BrandEvaluationEvidence[]>;
  supportingIdsByDecisionId: Record<string, string[]>;
} {
  const approvedById = new Map(approved.map((item) => [item.id, item]));
  const evidenceByDecisionId: Record<string, BrandEvaluationEvidence[]> = {};
  const supportingIdsByDecisionId: Record<string, string[]> = {};
  for (const decisionId of decisionIds) {
    evidenceByDecisionId[decisionId] = [];
    supportingIdsByDecisionId[decisionId] = [];
  }
  for (const link of links) {
    const evidence = approvedById.get(link.context_item_id);
    if (!evidence || !evidenceByDecisionId[link.decision_id]) continue;
    if (supportingIdsByDecisionId[link.decision_id].includes(evidence.id)) continue;
    supportingIdsByDecisionId[link.decision_id].push(evidence.id);
    evidenceByDecisionId[link.decision_id].push({
      id: evidence.id,
      type: evidence.type,
      content: evidence.content,
    });
  }
  return { evidenceByDecisionId, supportingIdsByDecisionId };
}

function categoryForPair(pair: string): BrandDecisionCategory | null {
  const priorityOrder: BrandDecisionCategory[] = [
    "POSITIONING",
    "PERSONALITY",
    "VOICE",
    "NAMING",
    "TAGLINE",
    "MESSAGING",
    "VISUAL_DIRECTION",
    "AUDIENCE",
    "VALUE_PROPOSITION",
    "DIFFERENTIATION",
    "LAUNCH",
  ];
  const lowered = pair.toLowerCase();
  for (const c of priorityOrder) {
    if (lowered.includes(c.toLowerCase().replace("_", " ")) || lowered.includes(c.toLowerCase().replace("_", ""))) {
      return c;
    }
  }
  // Keyword fallback
  if (lowered.includes("positioning")) return "POSITIONING";
  if (lowered.includes("personality")) return "PERSONALITY";
  if (lowered.includes("voice")) return "VOICE";
  if (lowered.includes("naming")) return "NAMING";
  if (lowered.includes("tagline")) return "TAGLINE";
  if (lowered.includes("audience")) return "AUDIENCE";
  if (lowered.includes("value")) return "VALUE_PROPOSITION";
  if (lowered.includes("differentiation")) return "DIFFERENTIATION";
  if (lowered.includes("visual") || lowered.includes("direction")) return "VISUAL_DIRECTION";
  if (lowered.includes("launch")) return "LAUNCH";
  if (lowered.includes("messaging")) return "MESSAGING";
  return null;
}

export async function runChallengeCritique(
  state: ChallengeCritiqueState | undefined,
  formData: FormData,
): Promise<ChallengeCritiqueState> {
  void state;
  const startupId = formData.get("startupId")?.toString() ?? "";
  if (!startupId) return { error: "Startup ID is required." };
  let startup;
  try {
    startup = await getStartup(startupId);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not load startup.";
    return { error: message };
  }
  if (!startup) return { error: "Startup no longer exists." };

  let decisions: BrandDecision[] = [];
  try {
    decisions = await getBrandDecisions(startupId);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not load decisions.";
    return { error: message };
  }
  const active = decisions.filter((d) => d.status === "active");
  if (active.length === 0) {
    return {
      error:
        "No active brand decisions yet. Generate strategy in the Brand tab and approve at least one decision.",
    };
  }

  let links: Awaited<ReturnType<typeof getDecisionContextLinks>> = [];
  try {
    links = await getDecisionContextLinks(startupId);
  } catch {
    links = [];
  }
  let ctx: ContextItem[] = [];
  try {
    ctx = await getContextItems(startupId);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not load context.";
    return { error: message };
  }
  const approved = await filterActiveApprovedContext(ctx);

  const evaluationMaps = buildEvaluationMaps(
    active.map((d) => d.id),
    links,
    approved,
  );

  const res = await orchestrateCritique({
    decisions: active,
    approvedContext: approved,
    ...evaluationMaps,
  });
  if (!res.ok) {
    if (res.err.kind === "config") {
      return { configError: true, error: res.err.message };
    }
    return { error: res.err.message };
  }
  return {
    issues: res.result.issues,
    checks: res.result.checks,
    evaluations: res.result.evaluations,
    evaluationError: res.result.evaluationError,
    referenceIds: res.result.referenceIds,
  };
}

export async function dismissChallengeIssue(
  _state: ChallengeDismissState | undefined,
  formData: FormData,
): Promise<ChallengeDismissState> {
  const id = formData.get("issueId")?.toString() ?? "";
  if (!id) return { error: "Issue ID is required." };
  return { dismissedIssueId: id };
}

export async function rejectDecisionFromChallenge(
  _state: StrategyActionState | undefined,
  formData: FormData,
): Promise<StrategyActionState> {
  const startupId = formData.get("startupId")?.toString() ?? "";
  const decisionId = formData.get("decisionId")?.toString() ?? "";
  if (!startupId || !decisionId) return { error: "Startup ID and decision ID are required." };
  try {
    await rejectBrandDecision(decisionId);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not reject decision.";
    return { error: message };
  }
  revalidatePath(`/startups/${startupId}`);
  return {};
}

export async function reviseDecisionFromChallenge(
  _state: ChallengeReviseState | undefined,
  formData: FormData,
): Promise<ChallengeReviseState> {
  const startupId = formData.get("startupId")?.toString() ?? "";
  const categoryRaw = formData.get("category")?.toString() ?? "";
  const challengeGuidance = formData.get("challengeGuidance")?.toString() ?? "";
  const excludeDecisionId = formData.get("affectedDecisionId")?.toString() ?? "";
  if (!startupId || !categoryRaw || !challengeGuidance) {
    return { error: "Startup ID, category, and challenge guidance are required." };
  }
  let startup;
  try {
    startup = await getStartup(startupId);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not load startup.";
    return { error: message };
  }
  if (!startup) return { error: "Startup no longer exists." };
  const roughIdea = startup.raw_idea?.trim() ?? "";

  let ctx: ContextItem[] = [];
  try {
    ctx = await getContextItems(startupId);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not load context.";
    return { roughIdea, error: message };
  }
  const approved = await filterActiveApprovedContext(ctx);
  if (approved.length === 0) {
    return {
      roughIdea,
      error:
        "No approved context yet. Approve at least one item in the Discovery section first.",
    };
  }

  let decisions: BrandDecision[] = [];
  try {
    decisions = await getBrandDecisions(startupId);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not load existing decisions.";
    return { roughIdea, error: message };
  }

  const existingActive = decisions
    .filter((d) => d.status === "active" && d.id !== excludeDecisionId)
    .map((d) => ({ category: d.category, title: d.title, content: d.content }));

  const res = await orchestrateStrategyGeneration({
    roughIdea,
    approvedContext: approved,
    existingActive,
    strategicGuidance: challengeGuidance,
    workflow: "revision",
    categories: [categoryRaw.toUpperCase() as BrandDecisionCategory],
  });

  if (!res.ok) {
    if (res.err.kind === "config") {
      return { roughIdea, configError: true, error: res.err.message };
    }
    return { roughIdea, error: res.err.message };
  }
  const filtered: StrategyResult = {
    decisions: res.result.decisions.filter(
      (d) => d.category.toUpperCase() === categoryRaw.toUpperCase(),
    ),
  };
  if (filtered.decisions.length === 0) {
    // Fallback: accept the full result if no category match
    return { roughIdea, proposed: await toDrafts(res.result) };
  }
  return { roughIdea, proposed: await toDrafts(filtered) };
}

export async function runConsistencyCheck(
  _state: ConsistencyCheckState | undefined,
  formData: FormData,
): Promise<ConsistencyCheckState> {
  const startupId = formData.get("startupId")?.toString() ?? "";
  if (!startupId) return { error: "Startup ID is required." };
  let decisions: BrandDecision[] = [];
  try {
    decisions = await getBrandDecisions(startupId);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not load decisions.";
    return { error: message };
  }
  const active = decisions.filter((d) => d.status === "active");
  let links: DecisionLinks = [];
  try {
    links = await getDecisionContextLinks(startupId);
  } catch {
    links = [];
  }
  let ctx: ContextItem[] = [];
  try {
    ctx = await getContextItems(startupId);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not load context.";
    return { error: message };
  }
  const approved = await filterActiveApprovedContext(ctx);
  const evaluationMaps = buildEvaluationMaps(
    active.map((d) => d.id),
    links,
    approved,
  );
  const res = await orchestrateConsistency({
    decisions: active,
    approvedContext: approved,
    ...evaluationMaps,
  });
  if (!res.ok) {
    if (res.err.kind === "config") {
      return { configError: true, error: res.err.message };
    }
    return { error: res.err.message };
  }
  return {
    pair_results: res.result.pair_results,
    evaluations: res.result.evaluations,
    evaluationError: res.result.evaluationError,
    referenceIds: res.result.referenceIds,
  };
}

export async function reviseDecisionFromConsistency(
  _state: ChallengeReviseState | undefined,
  formData: FormData,
): Promise<ChallengeReviseState> {
  const startupId = formData.get("startupId")?.toString() ?? "";
  const pair = formData.get("pair")?.toString() ?? "";
  const suggestedFix = formData.get("suggestedFix")?.toString() ?? "";
  if (!startupId || !pair || !suggestedFix) {
    return { error: "Startup ID, pair, and suggested fix are required." };
  }
  const category = categoryForPair(pair);
  if (!category) return { error: `Unable to infer category from pair: ${pair}` };
  const f = new FormData();
  f.set("startupId", startupId);
  f.set("category", category);
  f.set(
    "challengeGuidance",
    `Consistency Guardian flagged pair "${pair}". Suggested fix: ${suggestedFix}. Rewrite category ${category} to resolve this inconsistency.`,
  );
  f.set("affectedDecisionId", "");
  return reviseDecisionFromChallenge(_state, f);
}

// Export a small helper to persist revised decisions — actually we re-use strategy approve action
export { type ProposedDecisionDraft };

// Reuse existing persist/create helpers re-exported
export async function persistRevisedDecision(input: {
  startupId: string;
  draft: ProposedDecisionDraft;
}): Promise<{ ok: true; persistedId: string } | { ok: false; error: string }> {
  try {
    const decision = await createBrandDecisions([
      {
        startup_id: input.startupId,
        category: input.draft.category,
        title: input.draft.title,
        content: input.draft.content,
        rationale: input.draft.rationale ?? null,
        status: "proposed",
        supersedes_id: null,
      },
    ]);
    const persistedId = decision[0].id;
    const links: NewDecisionContextLinkInput[] = input.draft.supporting_context_ids.map(
      (cid) => ({
        decision_id: persistedId,
        context_item_id: cid,
        relationship_type: "supports",
      }),
    );
    if (links.length > 0) await createDecisionContextLinks(links);
    return { ok: true, persistedId };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not persist draft.";
    return { ok: false, error: message };
  }
}

// Keep exports to satisfy void lint rules for unused imports if re-exported
void EMPTY_CRITIQUE;
void EMPTY_DISMISS;
