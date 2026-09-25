"use server";

import { revalidatePath } from "next/cache";
import {
  createFounderFact,
  listFounderFacts,
  createChangeAnalysis,
  getChangeAnalyses,
  getChangeAnalysisImpacts,
  setChangeAnalysisStatus,
  toImpactType,
  type ImpactType,
  type NewImpactInput,
} from "@/lib/db/evolution";
import {
  createBrandDecisions,
  createDecisionContextLinks,
  getDecisionContextLinks,
} from "@/lib/db/brand-decisions";
import { getContextItems } from "@/lib/db/context";
import { getBrandDecisions } from "@/lib/db/brand-decisions";
import { createClient } from "@/lib/server";
import type {
  BrandDecision,
  BrandDecisionCategory,
  ChangeAnalysis,
  ChangeAnalysisImpact,
  ChangeAnalysisStatus,
  ContextItem,
  ImpactSeverity,
} from "@/lib/types/database";
import {
  runChangeAnalyst,
  type ChangeAnalysisAiResult,
  type ProposedImpact,
} from "@/lib/ai/change";

export type FounderFactDraft = {
  id: string;
  content: string;
  source: string;
  created_at: string | null;
  persisted: boolean;
};

export type ChangeImpactDraft = {
  impact_id: string;
  brand_decision_id: string;
  decision_category: BrandDecisionCategory;
  decision_title: string;
  decision_content: string;
  decision_rationale: string | null;
  decision_supporting_context_ids: string[];
  /**
   * Value stored in `change_analysis_impacts.impact_type`: the brand decision
   * category this impact lands on, which is what that column's check
   * constraint allows. See `toImpactType`.
   */
  impact_type: ImpactType;
  /** The kind of drift the analyst detected, kept for display and context. */
  drift_type?: string;
  severity: ImpactSeverity;
  reason: string;
  needs_review: boolean;
  proposed_title: string;
  proposed_content: string;
  proposed_rationale: string;
};

export type ChangeAnalysisDraft = {
  id: string;
  source_context_id: string;
  source_context_content: string;
  summary: string;
  status: ChangeAnalysisStatus;
  created_at: string | null;
  impacts: ChangeImpactDraft[];
  persisted: boolean;
  persisted_id?: string | null;
  reviewed_at: string | null;
};

export type AddContextState = {
  error?: string;
  newFact?: FounderFactDraft | null;
};

export type AnalyzeState = {
  error?: string;
  configError?: boolean;
  analysis?: ChangeAnalysisDraft | null;
};

export type ReviewState = {
  error?: string;
  updatedAnalysisId?: string | null;
  newStatus?: Exclude<ChangeAnalysisStatus, "pending"> | null;
};

function impactsFromAi(
  result: ChangeAnalysisAiResult,
  decisionsById: Map<string, BrandDecision>,
  linksByDecision: Map<string, string[]>,
): ChangeImpactDraft[] {
  const out: ChangeImpactDraft[] = [];
  const now = Date.now().toString(36);
  let seq = 0;
  for (const imp of result.impacts) {
    const d = decisionsById.get(imp.brand_decision_id);
    if (!d) continue;
    // The persisted impact_type is the impacted decision's category; the
    // analyst's own drift classification is kept alongside it.
    const impactType = toImpactType(d.category);
    if (!impactType) continue;
    seq += 1;
    const supporting = linksByDecision.get(d.id) ?? [];
    const aiImp = imp as ProposedImpact;
    out.push({
      impact_id: `imp_${now}_${seq}`,
      brand_decision_id: d.id,
      decision_category: d.category,
      decision_title: d.title,
      decision_content: d.content,
      decision_rationale: d.rationale,
      decision_supporting_context_ids: supporting,
      impact_type: impactType,
      drift_type: imp.impact_type,
      severity: imp.severity,
      reason: imp.reason,
      needs_review: aiImp.needs_review,
      proposed_title: aiImp.proposed_title,
      proposed_content: aiImp.proposed_content,
      proposed_rationale: aiImp.proposed_rationale,
    });
  }
  return out;
}

/**
 * Maps draft impacts to insertable rows. `impact_type` is normalised to the
 * decision category the column's check constraint allows, so a stale or
 * tampered payload is rejected before anything is written instead of failing
 * mid-insert and stranding a committed analysis row.
 */
function impactRowsFromDrafts(impacts: readonly ChangeImpactDraft[]): {
  rows: NewImpactInput[];
  invalid: string | null;
} {
  const rows: NewImpactInput[] = [];
  for (const [index, i] of impacts.entries()) {
    const impactType =
      toImpactType(i.impact_type) ?? toImpactType(i.decision_category);
    if (!impactType) {
      const label = i.decision_title || `decision ${index + 1}`;
      return {
        rows: [],
        invalid: `Cannot record the impact on "${label}": its category is not a supported impact type.`,
      };
    }
    rows.push({
      brand_decision_id: i.brand_decision_id,
      impact_type: impactType,
      severity: i.severity,
      reason: i.reason,
    });
  }
  return { rows, invalid: null };
}

export async function addFounderContext(
  state: AddContextState | undefined,
  formData: FormData,
): Promise<AddContextState> {
  void state;
  const startupId = formData.get("startupId")?.toString() ?? "";
  const content = formData.get("content")?.toString() ?? "";

  if (!startupId) return { error: "Startup ID is required." };
  const trimmed = content.trim();
  if (!trimmed) {
    return { error: "Please enter new information before submitting." };
  }
  if (trimmed.length > 2000) {
    return { error: "Please keep new context under 2000 characters." };
  }

  let ctx: ContextItem;
  try {
    ctx = await createFounderFact({
      startup_id: startupId,
      content: trimmed,
      source: "FOUNDER_INPUT",
      confidence: 1.0,
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to add context.";
    return { error: message };
  }

  revalidatePath(`/startups/${startupId}`);

  return {
    newFact: {
      id: ctx.id,
      content: ctx.content,
      source: ctx.source ?? "FOUNDER_INPUT",
      created_at: ctx.created_at,
      persisted: true,
    },
  };
}

export async function runChangeAnalysisFromContext(
  state: AnalyzeState | undefined,
  formData: FormData,
): Promise<AnalyzeState> {
  void state;
  const startupId = formData.get("startupId")?.toString() ?? "";
  const sourceContextId = formData.get("sourceContextId")?.toString() ?? "";
  if (!startupId || !sourceContextId) {
    return { error: "Missing startup or context ID." };
  }

  let context: ContextItem[];
  try {
    context = await getContextItems(startupId);
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to load startup context.";
    return { error: message };
  }

  const active = context.filter(
    (c) =>
      c.status === "active" &&
      (c.type === "FACT" ||
        c.type === "INFERENCE" ||
        c.type === "HYPOTHESIS"),
  );
  const newCtx = active.find((c) => c.id === sourceContextId);
  if (!newCtx) {
    return {
      error:
        "The context you referenced no longer exists or is not active.",
    };
  }

  let decisions: BrandDecision[];
  try {
    decisions = await getBrandDecisions(startupId);
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to load brand decisions.";
    return { error: message };
  }

  const activeDecisions = decisions.filter((d) => d.status === "active");
  if (activeDecisions.length === 0) {
    return {
      error:
        "No active brand decisions yet. Approve brand strategy in the Brand section, then run change analysis.",
    };
  }

  let existingAnalyses: ChangeAnalysis[] = [];
  try {
    existingAnalyses = await getChangeAnalyses(startupId);
  } catch {
    existingAnalyses = [];
  }

  const alreadyAnalyzed = existingAnalyses.some(
    (a) =>
      a.source_context_item_id === sourceContextId &&
      (a.status === "pending" ||
        a.status === "approved" ||
        a.status === "ignored"),
  );
  if (alreadyAnalyzed) {
    return {
      error:
        "This new context has already been analyzed. Review its existing analysis below.",
    };
  }

  let existingLinks: Array<{
    decision_id: string;
    context_item_id: string;
  }> = [];
  try {
    existingLinks = await getDecisionContextLinks(startupId);
  } catch {
    existingLinks = [];
  }
  const linksByDecision = new Map<string, string[]>();
  for (const l of existingLinks) {
    const arr = linksByDecision.get(l.decision_id) ?? [];
    arr.push(l.context_item_id);
    linksByDecision.set(l.decision_id, arr);
  }
  const decisionsById = new Map<string, BrandDecision>();
  for (const d of activeDecisions) decisionsById.set(d.id, d);

  const ai = await runChangeAnalyst(
    {
      id: newCtx.id,
      type: newCtx.type,
      content: newCtx.content,
      confidence: newCtx.confidence,
      source: newCtx.source ?? null,
    },
    active.map((c) => ({
      id: c.id,
      type: c.type,
      content: c.content,
      confidence: c.confidence,
      source: c.source ?? null,
    })),
    activeDecisions.map((d) => ({
      id: d.id,
      category: d.category,
      title: d.title,
      content: d.content,
      rationale: d.rationale,
      supporting_context_ids: linksByDecision.get(d.id) ?? [],
    })),
  );

  if (!ai.ok) {
    const e = ai.err;
    if (e.kind === "config") {
      return { configError: true, error: e.message };
    }
    if (e.kind === "parse") {
      console.error("[evolution:parse]", e.message);
      return {
        error:
          "The AI returned a malformed change analysis. Please try again.",
      };
    }
    console.error("[evolution:model]", e.message);
    return { error: e.message };
  }

  const impacts = impactsFromAi(ai.result, decisionsById, linksByDecision);
  if (impacts.length === 0) {
    return {
      error:
        "No active decisions were identified as affected by this new information. No analysis created.",
    };
  }

  const analysisDraftId = `ca_${Date.now().toString(36)}`;
  return {
    analysis: {
      id: analysisDraftId,
      source_context_id: newCtx.id,
      source_context_content: newCtx.content,
      summary: ai.result.summary,
      status: "pending",
      created_at: null,
      impacts,
      persisted: false,
      persisted_id: null,
      reviewed_at: null,
    },
  };
}

export async function approveRevisionForAnalysis(
  state: ReviewState | undefined,
  formData: FormData,
): Promise<ReviewState> {
  void state;
  const startupId = formData.get("startupId")?.toString() ?? "";
  const draftId = formData.get("analysisId")?.toString() ?? "";
  const sourceContextId = formData.get("sourceContextId")?.toString() ?? "";
  const summary = formData.get("summary")?.toString() ?? "";
  const impactsJson = formData.get("impacts")?.toString() ?? "";
  const persistedId = formData.get("persistedId")?.toString();

  if (!startupId || !draftId || !sourceContextId || !summary || !impactsJson) {
    return { error: "Missing required fields." };
  }

  let impacts: ChangeImpactDraft[] = [];
  try {
    const parsed = JSON.parse(impactsJson);
    if (Array.isArray(parsed)) impacts = parsed as ChangeImpactDraft[];
  } catch {
    return { error: "Malformed impact payload." };
  }

  const needsReview = impacts.filter((i) => i.needs_review);

  try {
    const supabase = await createClient();
    let finalAnalysisId: string;

    if (persistedId) {
      const a = await setChangeAnalysisStatus(persistedId, "approved");
      finalAnalysisId = a.id;
    } else {
      const { rows: impactInput, invalid: invalidImpactType } =
        impactRowsFromDrafts(impacts);
      if (invalidImpactType) return { error: invalidImpactType };

      const { analysis } = await createChangeAnalysis(
        {
          startup_id: startupId,
          source_context_item_id: sourceContextId,
          summary: summary.trim(),
          status: "approved",
          analysis: { impacts },
        },
        impactInput,
      );
      finalAnalysisId = analysis.id;

      for (const imp of needsReview) {
        const oldRows = await getBrandDecisions(startupId).then((rows) =>
          rows.filter((r) => r.id === imp.brand_decision_id),
        );
        if (oldRows.length === 0) continue;
        const old = oldRows[0]!;

        const replacementRows = await createBrandDecisions([
          {
            startup_id: startupId,
            category: imp.decision_category,
            title: imp.proposed_title || `${imp.decision_title} (revised)`,
            content: imp.proposed_content,
            rationale: imp.proposed_rationale
              ? imp.proposed_rationale
              : imp.decision_rationale
                ? `${imp.decision_rationale}\n\nRevised following change analysis ${finalAnalysisId}.`
                : `Revised following change analysis ${finalAnalysisId}.`,
            status: "active",
            supersedes_id: old.id,
          },
        ]);
        const newDecision = replacementRows[0];
        if (!newDecision) continue;

        await supabase
          .from("brand_decisions")
          .update({
            status: "superseded",
            updated_at: new Date().toISOString(),
          })
          .eq("id", old.id);

        const origLinks = imp.decision_supporting_context_ids
          .filter((id) => Boolean(id))
          .map((ctxId) => ({
            decision_id: newDecision!.id,
            context_item_id: ctxId,
            relationship_type: "supports" as const,
          }));
        const derivedFromTrigger =
          sourceContextId && !origLinks.some((l) => l.context_item_id === sourceContextId)
            ? [
                {
                  decision_id: newDecision!.id,
                  context_item_id: sourceContextId,
                  relationship_type: "derived_from" as const,
                },
              ]
            : [];
        await createDecisionContextLinks([...origLinks, ...derivedFromTrigger]);
      }
    }

    revalidatePath(`/startups/${startupId}`);
    return { updatedAnalysisId: finalAnalysisId, newStatus: "approved" };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to approve revision.";
    return { error: message };
  }
}

export async function keepCurrentForAnalysis(
  state: ReviewState | undefined,
  formData: FormData,
): Promise<ReviewState> {
  void state;
  const startupId = formData.get("startupId")?.toString() ?? "";
  const draftId = formData.get("analysisId")?.toString() ?? "";
  const sourceContextId = formData.get("sourceContextId")?.toString() ?? "";
  const summary = formData.get("summary")?.toString() ?? "";
  const impactsJson = formData.get("impacts")?.toString() ?? "";
  const persistedId = formData.get("persistedId")?.toString();

  if (!startupId || !draftId || !sourceContextId || !summary || !impactsJson) {
    return { error: "Missing required fields." };
  }

  let impacts: ChangeImpactDraft[] = [];
  try {
    const parsed = JSON.parse(impactsJson);
    if (Array.isArray(parsed)) impacts = parsed as ChangeImpactDraft[];
  } catch {
    return { error: "Malformed impact payload." };
  }

  try {
    let finalAnalysisId: string;
    if (persistedId) {
      const a = await setChangeAnalysisStatus(persistedId, "ignored");
      finalAnalysisId = a.id;
    } else {
      const { rows: impactInput, invalid: invalidImpactType } =
        impactRowsFromDrafts(impacts);
      if (invalidImpactType) return { error: invalidImpactType };
      const { analysis } = await createChangeAnalysis(
        {
          startup_id: startupId,
          source_context_item_id: sourceContextId,
          summary: summary.trim(),
          status: "ignored",
          analysis: { impacts },
        },
        impactInput,
      );
      finalAnalysisId = analysis.id;
    }
    revalidatePath(`/startups/${startupId}`);
    return { updatedAnalysisId: finalAnalysisId, newStatus: "ignored" };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to keep current decisions.";
    return { error: message };
  }
}

export async function rejectAnalysis(
  state: ReviewState | undefined,
  formData: FormData,
): Promise<ReviewState> {
  void state;
  const startupId = formData.get("startupId")?.toString() ?? "";
  const draftId = formData.get("analysisId")?.toString() ?? "";
  const sourceContextId = formData.get("sourceContextId")?.toString() ?? "";
  const summary = formData.get("summary")?.toString() ?? "";
  const impactsJson = formData.get("impacts")?.toString() ?? "";
  const persistedId = formData.get("persistedId")?.toString();

  if (!startupId || !draftId || !sourceContextId || !summary || !impactsJson) {
    return { error: "Missing required fields." };
  }

  let impacts: ChangeImpactDraft[] = [];
  try {
    const parsed = JSON.parse(impactsJson);
    if (Array.isArray(parsed)) impacts = parsed as ChangeImpactDraft[];
  } catch {
    return { error: "Malformed impact payload." };
  }

  try {
    let finalAnalysisId: string;
    if (persistedId) {
      const a = await setChangeAnalysisStatus(persistedId, "rejected");
      finalAnalysisId = a.id;
    } else {
      const { rows: impactInput, invalid: invalidImpactType } =
        impactRowsFromDrafts(impacts);
      if (invalidImpactType) return { error: invalidImpactType };
      const { analysis } = await createChangeAnalysis(
        {
          startup_id: startupId,
          source_context_item_id: sourceContextId,
          summary: summary.trim(),
          status: "rejected",
          analysis: { impacts },
        },
        impactInput,
      );
      finalAnalysisId = analysis.id;
    }
    revalidatePath(`/startups/${startupId}`);
    return { updatedAnalysisId: finalAnalysisId, newStatus: "rejected" };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to reject analysis.";
    return { error: message };
  }
}

export async function listFounderFactsServer(
  startupId: string,
): Promise<FounderFactDraft[]> {
  const rows = await listFounderFacts(startupId);
  return rows.map((r) => ({
    id: r.id,
    content: r.content,
    source: r.source ?? "FOUNDER_INPUT",
    created_at: r.created_at,
    persisted: true,
  }));
}

export type LoadedEvolution = {
  founderFacts: FounderFactDraft[];
  analyses: ChangeAnalysis[];
  impacts: ChangeAnalysisImpact[];
  activeDecisions: BrandDecision[];
  decisionContextLinks: Array<{ decision_id: string; context_item_id: string }>;
};

export async function loadEvolutionData(
  startupId: string,
): Promise<LoadedEvolution> {
  const [facts, analyses, impacts, decisions, links] = await Promise.all([
    listFounderFacts(startupId).catch(() => []),
    getChangeAnalyses(startupId).catch(() => []),
    getChangeAnalysisImpacts(startupId).catch(() => []),
    getBrandDecisions(startupId).catch(() => []),
    getDecisionContextLinks(startupId).catch(() => []),
  ]);
  return {
    founderFacts: facts.map((r) => ({
      id: r.id,
      content: r.content,
      source: r.source ?? "FOUNDER_INPUT",
      created_at: r.created_at,
      persisted: true,
    })),
    analyses,
    impacts,
    activeDecisions: decisions.filter(
      (d) => d.status === "active" || d.status === "superseded",
    ),
    decisionContextLinks: links,
  };
}
