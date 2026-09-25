"use server";

import { revalidatePath } from "next/cache";
import {
  createBrandDecisions,
  createDecisionContextLinks,
  approveBrandDecision,
  rejectBrandDecision,
  markCategorySiblingsSuperseded,
  type NewDecisionContextLinkInput,
} from "@/lib/db/brand-decisions";
import { getContextItems } from "@/lib/db/context";
import { getBrandDecisions } from "@/lib/db/brand-decisions";
import { getStartup } from "@/lib/db/startups";
import type {
  BrandDecision,
  BrandDecisionCategory,
  ContextItem,
} from "@/lib/types/database";
import {
  type StrategyResult,
  type ProposedStrategyDecision,
} from "@/lib/ai/strategy";
import { orchestrateStrategyGeneration } from "@/lib/ai/orchestration";

export type ProposedDecisionDraft = {
  tempId: string;
  category: BrandDecisionCategory;
  title: string;
  content: string;
  rationale: string;
  supporting_context_ids: string[];
  uncertainty: string | null;
  persisted: boolean;
  persistedId?: string | null;
  state: "proposed" | "approved" | "rejected";
};

export type StrategyActionState = {
  error?: string;
  configError?: boolean;
  proposed?: ProposedDecisionDraft[] | null;
  roughIdea?: string | null;
};

type PersistResult = {
  persistedId: string;
};

export async function toDrafts(
  result: StrategyResult,
): Promise<ProposedDecisionDraft[]> {
  const out: ProposedDecisionDraft[] = [];
  let seq = 0;
  const now = Date.now().toString(36);
  for (const d of result.decisions) {
    seq += 1;
    out.push({
      tempId: `sd_${now}_${seq}`,
      category: d.category,
      title: d.title,
      content: d.content,
      rationale: d.rationale,
      supporting_context_ids: [...d.supporting_context_ids],
      uncertainty: d.uncertainty ?? null,
      persisted: false,
      persistedId: null,
      state: "proposed",
    });
  }
  return out;
}

export async function filterActiveApprovedContext(
  rows: ContextItem[],
): Promise<ContextItem[]> {
  return rows.filter(
    (c) =>
      c.status === "active" &&
      (c.type === "FACT" ||
        c.type === "INFERENCE" ||
        c.type === "HYPOTHESIS"),
  );
}

export async function runStrategyGeneration(
  state: StrategyActionState | undefined,
  formData: FormData,
): Promise<StrategyActionState> {
  void state;
  const startupId = formData.get("startupId")?.toString() ?? "";
  if (!startupId) return { error: "Startup ID is required." };

  let startup;
  try {
    startup = await getStartup(startupId);
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Could not load startup.";
    return { error: message };
  }
  if (!startup) return { error: "Startup no longer exists." };

  const roughIdea = startup.raw_idea?.trim() ?? "";

  let context: ContextItem[];
  try {
    context = await getContextItems(startupId);
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Could not load startup context.";
    return { roughIdea, error: message };
  }

  const approved = await filterActiveApprovedContext(context);
  if (approved.length === 0) {
    return {
      roughIdea,
      error:
        "No approved startup context yet. Approve at least one Fact, Inference, or Hypothesis in the Discovery section first, then generate strategy.",
    };
  }

  let existingActive: BrandDecision[] = [];
  try {
    const all = await getBrandDecisions(startupId);
    existingActive = all.filter((d) => d.status === "active");
  } catch {
    existingActive = [];
  }

  const res = await orchestrateStrategyGeneration({
    roughIdea,
    approvedContext: approved.map((c) => ({
      id: c.id,
      type: c.type,
      content: c.content,
      confidence: c.confidence,
    })),
    existingActive: existingActive.map((d) => ({
      category: d.category,
      title: d.title,
      content: d.content,
    })),
    workflow: "strategy",
  });

  if (!res.ok) {
    const e = res.err;
    if (e.kind === "config") {
      return { roughIdea, configError: true, error: e.message };
    }
    if (e.kind === "parse") {
      // eslint-disable-next-line no-console
      console.error("[strategy:parse]", e.message, e.raw);
      return {
        roughIdea,
        error:
          "The AI returned a malformed strategy response. Please try again.",
      };
    }
    // eslint-disable-next-line no-console
    console.error(
      "[strategy:model]",
      e.message,
      (e as { raw?: unknown }).raw,
    );
    return { roughIdea, error: e.message };
  }

  const drafts = await toDrafts(res.result);
  return { proposed: drafts, roughIdea };
}

export type DecisionReviewState = {
  error?: string;
  updatedTempId?: string | null;
  updatedId?: string | null;
  newState?: ProposedDecisionDraft["state"] | null;
};

async function persistDecisionAndLinks(
  startupId: string,
  draft: Omit<ProposedDecisionDraft, "state"> & {
    status: "proposed" | "active" | "rejected";
  },
): Promise<PersistResult> {
  const rows = await createBrandDecisions([
    {
      startup_id: startupId,
      category: draft.category,
      title: draft.title,
      content: draft.content,
      rationale: draft.rationale,
      status: draft.status,
      supersedes_id: null,
    },
  ]);
  const created = rows[0]!;
  const linkInput: NewDecisionContextLinkInput[] =
    draft.supporting_context_ids.map((ctxId) => ({
      decision_id: created.id,
      context_item_id: ctxId,
      relationship_type: "supports",
    }));
  if (linkInput.length > 0) {
    await createDecisionContextLinks(linkInput);
  }
  if (draft.status === "active") {
    await markCategorySiblingsSuperseded(
      startupId,
      draft.category,
      created.id,
    );
  }
  return { persistedId: created.id };
}

export async function approveStrategyDecision(
  state: DecisionReviewState | undefined,
  formData: FormData,
): Promise<DecisionReviewState> {
  void state;
  const startupId = formData.get("startupId")?.toString() ?? "";
  const tempId = formData.get("tempId")?.toString() ?? "";
  const category = formData.get("category")?.toString() ?? "";
  const title = formData.get("title")?.toString() ?? "";
  const content = formData.get("content")?.toString() ?? "";
  const rationale = formData.get("rationale")?.toString() ?? "";
  const uncertainty = formData.get("uncertainty")?.toString();
  const supportingStr = formData.get("supporting_context_ids")?.toString();

  if (!startupId || !tempId || !category || !title || !content) {
    return { error: "Missing required fields." };
  }

  const supporting = supportingStr
    ? supportingStr
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    : [];

  const persistedId = formData.get("persistedId")?.toString();

  try {
    let finalId: string;
    if (persistedId) {
      const updated = await approveBrandDecision(persistedId);
      finalId = updated.id;
    } else {
      const result = await persistDecisionAndLinks(startupId, {
        tempId,
        category: category as BrandDecisionCategory,
        title,
        content,
        rationale,
        supporting_context_ids: supporting,
        uncertainty: uncertainty ?? null,
        persisted: false,
        persistedId: null,
        status: "active",
      });
      finalId = result.persistedId;
      if (uncertainty) {
        // rationale already captures any uncertainty, no extra DB field needed
      }
      void uncertainty;
    }
    revalidatePath(`/startups/${startupId}`);
    return {
      updatedTempId: tempId,
      updatedId: finalId,
      newState: "approved",
    };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Could not approve this decision.";
    return { error: message };
  }
}

export async function rejectStrategyDecision(
  state: DecisionReviewState | undefined,
  formData: FormData,
): Promise<DecisionReviewState> {
  void state;
  const startupId = formData.get("startupId")?.toString() ?? "";
  const tempId = formData.get("tempId")?.toString() ?? "";
  const category = formData.get("category")?.toString() ?? "";
  const title = formData.get("title")?.toString() ?? "";
  const content = formData.get("content")?.toString() ?? "";
  const rationale = formData.get("rationale")?.toString() ?? "";
  const supportingStr = formData.get("supporting_context_ids")?.toString();

  if (!startupId || !tempId || !category || !title || !content) {
    return { error: "Missing required fields." };
  }

  const supporting = supportingStr
    ? supportingStr
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    : [];

  const persistedId = formData.get("persistedId")?.toString();

  try {
    let finalId: string;
    if (persistedId) {
      const updated = await rejectBrandDecision(persistedId);
      finalId = updated.id;
    } else {
      const result = await persistDecisionAndLinks(startupId, {
        tempId,
        category: category as BrandDecisionCategory,
        title,
        content,
        rationale,
        supporting_context_ids: supporting,
        uncertainty: null,
        persisted: false,
        persistedId: null,
        status: "rejected",
      });
      finalId = result.persistedId;
    }
    revalidatePath(`/startups/${startupId}`);
    return {
      updatedTempId: tempId,
      updatedId: finalId,
      newState: "rejected",
    };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Could not reject this decision.";
    return { error: message };
  }
}

export type { ProposedStrategyDecision };
