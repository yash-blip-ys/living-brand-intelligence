"use server";

import { revalidatePath } from "next/cache";
import type { ContextItem } from "@/lib/types/database";
import {
  approveContextItem,
  createContextItems,
  rejectContextItem,
} from "@/lib/db/context";
import { getStartup } from "@/lib/db/startups";
import {
  runDiscoveryAnalyst,
  type DiscoveryResult,
  type DiscoveryContextInput,
} from "@/lib/ai/discovery";

export type ProposedContextItemDraft = {
  tempId: string;
  type: "FACT" | "INFERENCE" | "HYPOTHESIS";
  content: string;
  confidence: number | null;
  source: string | null;
  reasoning: string | null;
  persisted: boolean;
  persistedId?: string | null;
  state: "proposed" | "approved" | "rejected";
};

export type DiscoveryActionState = {
  error?: string;
  configError?: boolean;
  analyzing?: boolean;
  proposed?: ProposedContextItemDraft[] | null;
  roughIdea?: string | null;
};

function bucketForType(
  type: "FACT" | "INFERENCE" | "HYPOTHESIS",
): (DiscoveryResult)["facts"] {
  return [] as DiscoveryContextInput[];
  void type;
}

function toDrafts(result: DiscoveryResult): ProposedContextItemDraft[] {
  const buckets: Array<{
    type: "FACT" | "INFERENCE" | "HYPOTHESIS";
    items: DiscoveryContextInput[];
  }> = [
    { type: "FACT", items: result.facts },
    { type: "INFERENCE", items: result.inferences },
    { type: "HYPOTHESIS", items: result.hypotheses },
  ];

  const out: ProposedContextItemDraft[] = [];
  let seq = 0;
  for (const { type, items } of buckets) {
    for (const it of items) {
      seq += 1;
      out.push({
        tempId: `d_${Date.now().toString(36)}_${seq}`,
        type,
        content: it.content,
        confidence: it.confidence ?? null,
        source: it.source ?? null,
        reasoning: it.reasoning ?? null,
        persisted: false,
        persistedId: null,
        state: "proposed",
      });
    }
  }
  return out;
}

export async function runDiscoveryAnalysis(
  state: DiscoveryActionState | undefined,
  formData: FormData,
): Promise<DiscoveryActionState> {
  const startupId = formData.get("startupId")?.toString() ?? "";
  if (!startupId) {
    return { error: "Startup ID is required." };
  }

  let startup;
  try {
    startup = await getStartup(startupId);
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Could not load startup.";
    return { error: message };
  }

  if (!startup) {
    return { error: "Startup no longer exists." };
  }

  const roughIdea = startup.raw_idea?.trim() ?? "";
  if (!roughIdea) {
    return {
      roughIdea,
      error:
        "There is no rough idea to analyze. Return to the first step and describe what you're building.",
    };
  }

  const res = await runDiscoveryAnalyst(roughIdea);
  if (!res.ok) {
    const e = res.err;
    if (e.kind === "config") {
      return {
        roughIdea,
        configError: true,
        error: e.message,
      };
    }
    if (e.kind === "parse") {
      // eslint-disable-next-line no-console
      console.error("[discovery:parse]", e.message, e.raw);
      return {
        roughIdea,
        error:
          "The AI returned a malformed discovery response. Please try again.",
      };
    }
    // eslint-disable-next-line no-console
    console.error("[discovery:model]", e.message, (e as { raw?: unknown }).raw);
    return { roughIdea, error: e.message };
  }

  const drafts = toDrafts(res.result);
  return { proposed: drafts, roughIdea };
}

export type ReviewActionState = {
  error?: string;
  updatedTempId?: string | null;
  updatedId?: string | null;
  newState?: ProposedContextItemDraft["state"] | null;
};

const EMPTY: ReviewActionState = {};

export async function approveDiscoveryItem(
  state: ReviewActionState | undefined,
  formData: FormData,
): Promise<ReviewActionState> {
  const startupId = formData.get("startupId")?.toString() ?? "";
  const tempId = formData.get("tempId")?.toString() ?? "";
  const typeRaw = formData.get("type")?.toString() ?? "";
  const content = formData.get("content")?.toString() ?? "";
  const sourceRaw = formData.get("source")?.toString();
  const confidenceRaw = formData.get("confidence")?.toString();
  const reasoningRaw = formData.get("reasoning")?.toString();
  const roughIdeaRaw = formData.get("roughIdea")?.toString();

  void state;

  if (!startupId || !tempId || !typeRaw || !content) {
    return { error: "Missing required fields." };
  }

  const ok =
    typeRaw === "FACT" ||
    typeRaw === "INFERENCE" ||
    typeRaw === "HYPOTHESIS";
  const type: "FACT" | "INFERENCE" | "HYPOTHESIS" | null = ok ? typeRaw : null;
  if (!type) return { error: "Invalid context item type." };

  const confidence = confidenceRaw
    ? Number(confidenceRaw)
    : null;

  const metadata:
    | {
        reasoning?: string | null;
        fromRoughIdea?: string | null;
        sourceDiscovery?: string;
      }
    | null = {
    reasoning: reasoningRaw?.trim() || null,
    fromRoughIdea: roughIdeaRaw?.trim() || null,
    sourceDiscovery: "v1",
  };

  let created: ContextItem;
  try {
    const rows = await createContextItems([
      {
        startup_id: startupId,
        type,
        content,
        status: "active",
        source: sourceRaw?.trim() || null,
        confidence: confidence && Number.isFinite(confidence) ? confidence : null,
        metadata,
      },
    ]);
    created = rows[0]!;
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Could not approve this context item.";
    return { error: message };
  }

  revalidatePath(`/startups/${startupId}`);

  return {
    updatedTempId: tempId, updatedId: created.id, newState: "approved" };
}

export async function rejectDiscoveryItem(
  state: ReviewActionState | undefined,
  formData: FormData,
): Promise<ReviewActionState> {
  const startupId = formData.get("startupId")?.toString() ?? "";
  const tempId = formData.get("tempId")?.toString() ?? "";
  const typeRaw = formData.get("type")?.toString() ?? "";
  const content = formData.get("content")?.toString() ?? "";
  const sourceRaw = formData.get("source")?.toString();
  const confidenceRaw = formData.get("confidence")?.toString();
  const reasoningRaw = formData.get("reasoning")?.toString();
  const rejectionReason = formData.get("rejectionReason")?.toString() ?? "";
  const roughIdeaRaw = formData.get("roughIdea")?.toString();

  void state;

  if (!startupId || !tempId || !typeRaw || !content) {
    return { error: "Missing required fields." };
  }

  const okR =
    typeRaw === "FACT" ||
    typeRaw === "INFERENCE" ||
    typeRaw === "HYPOTHESIS";
  const type: "FACT" | "INFERENCE" | "HYPOTHESIS" | null = okR ? typeRaw : null;
  if (!type) return { error: "Invalid context item type." };

  const confidence = confidenceRaw ? Number(confidenceRaw) : null;
  const metadata = {
    reasoning: reasoningRaw?.trim() || null,
    fromRoughIdea: roughIdeaRaw?.trim() || null,
    sourceDiscovery: "v1",
    proposedAsType: type,
  };

  let created: ContextItem;
  try {
    const rows = await createContextItems([
      {
        startup_id: startupId,
        type: "REJECTED",
        content,
        status: "archived",
        source: sourceRaw?.trim() || null,
        confidence: confidence && Number.isFinite(confidence) ? confidence : null,
        metadata,
        rejectionReason: rejectionReason.trim() || null,
      } as never,
    ]);
    created = rows[0]!;
    if (rejectionReason.trim()) {
      created = await rejectContextItem(created.id, rejectionReason);
    }
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Could not reject this context item.";
    return { error: message };
  }

  revalidatePath(`/startups/${startupId}`);

  return {
    updatedTempId: tempId, updatedId: created.id, newState: "rejected" };
}

void bucketForType;
