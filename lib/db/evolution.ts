import { createClient } from "@/lib/server";
import {
  IMPACT_TYPES,
  toImpactType,
  type ImpactType,
} from "@/lib/types/impact-types";
import type {
  ChangeAnalysis,
  ChangeAnalysisImpact,
  ChangeAnalysisStatus,
  ContextItem,
  ContextItemType,
  Database,
  ImpactSeverity,
  Json,
} from "@/lib/types/database";

type ContextInsert =
  Database["public"]["Tables"]["context_items"]["Insert"];

type ChangeAnalysisInsert =
  Database["public"]["Tables"]["change_analyses"]["Insert"];

type ChangeAnalysisImpactInsert =
  Database["public"]["Tables"]["change_analysis_impacts"]["Insert"];

export type NewFounderFactInput = {
  startup_id: string;
  content: string;
  source?: string | null;
  confidence?: number | null;
};

export {
  IMPACT_TYPES,
  toImpactType,
  type ImpactType,
} from "@/lib/types/impact-types";

export async function createFounderFact(
  input: NewFounderFactInput,
): Promise<ContextItem> {
  const content = input.content.trim();
  if (!content) throw new Error("Context content is required.");
  if (!input.startup_id) throw new Error("Startup ID is required.");

  const row: ContextInsert = {
    startup_id: input.startup_id,
    type: "FACT" satisfies ContextItemType,
    content,
    status: "active",
    source: input.source?.trim() || "FOUNDER_INPUT",
    confidence: input.confidence ?? 1.0,
    supersedes_id: null,
    rejection_reason: null,
    // context_items.metadata is NOT NULL. Founder facts use the same shape
    // Discovery writes, so every context item carries a metadata object.
    metadata: {
      reasoning: null,
      fromRoughIdea: null,
      sourceDiscovery: "v1",
    },
  };

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("context_items")
    .insert(row)
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to create founder fact: ${error.message}`);
  }

  return data as ContextItem;
}

export async function listFounderFacts(
  startupId: string,
  limit = 50,
): Promise<ContextItem[]> {
  if (!startupId) throw new Error("Startup ID is required.");
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("context_items")
    .select("*")
    .eq("startup_id", startupId)
    .eq("source", "FOUNDER_INPUT")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(`Failed to list founder facts: ${error.message}`);
  }

  return (data ?? []) as ContextItem[];
}

export type NewChangeAnalysisInput = {
  startup_id: string;
  source_context_item_id: string;
  summary: string;
  analysis?: Json | null;
  status?: ChangeAnalysisStatus;
};

export type NewImpactInput = {
  brand_decision_id: string;
  impact_type: ImpactType;
  severity: ImpactSeverity;
  reason: string;
};

export async function createChangeAnalysis(
  input: NewChangeAnalysisInput,
  impacts: readonly NewImpactInput[],
): Promise<{
  analysis: ChangeAnalysis;
  impacts: ChangeAnalysisImpact[];
}> {
  if (!input.startup_id) throw new Error("Startup ID is required.");
  if (!input.source_context_item_id)
    throw new Error("Source context item ID is required.");
  const summary = input.summary.trim();
  if (!summary) throw new Error("Change analysis summary is required.");

  // Validate every impact BEFORE writing anything: the impact check constraint
  // can only fail the insert, and without DELETE permission on
  // change_analysis_impacts a failed insert would strand a committed analysis
  // with no impacts.
  impacts.forEach((imp, index) => {
    if (!imp.brand_decision_id) {
      throw new Error(`Impact ${index + 1} is missing a brand decision.`);
    }
    if (toImpactType(imp.impact_type) === null) {
      throw new Error(
        `Impact ${index + 1} has an unsupported impact type "${imp.impact_type}". Expected one of: ${IMPACT_TYPES.join(", ")}.`,
      );
    }
  });

  const supabase = await createClient();

  const insertRow: ChangeAnalysisInsert = {
    startup_id: input.startup_id,
    source_context_item_id: input.source_context_item_id,
    summary,
    status: input.status ?? "pending",
    analysis: input.analysis ?? null,
    reviewed_at: null,
  };

  const { data: analysis, error: aErr } = await supabase
    .from("change_analyses")
    .insert(insertRow)
    .select()
    .single();

  if (aErr) {
    throw new Error(`Failed to create change analysis: ${aErr.message}`);
  }

  let createdImpacts: ChangeAnalysisImpact[] = [];

  if (impacts.length > 0) {
    const rows: ChangeAnalysisImpactInsert[] = impacts.map((imp) => ({
      change_analysis_id: (analysis as ChangeAnalysis).id,
      brand_decision_id: imp.brand_decision_id,
      impact_type: imp.impact_type,
      severity: imp.severity,
      reason: imp.reason,
    }));
    const { data: impactData, error: iErr } = await supabase
      .from("change_analysis_impacts")
      .insert(rows)
      .select();

    if (iErr) {
      throw new Error(
        `Failed to create change analysis impacts: ${iErr.message}`,
      );
    }
    createdImpacts = (impactData ?? []) as ChangeAnalysisImpact[];
  }

  return {
    analysis: analysis as ChangeAnalysis,
    impacts: createdImpacts,
  };
}

export async function getChangeAnalyses(
  startupId: string,
): Promise<ChangeAnalysis[]> {
  if (!startupId) throw new Error("Startup ID is required.");
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("change_analyses")
    .select("*")
    .eq("startup_id", startupId)
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(`Failed to load change analyses: ${error.message}`);
  }

  return (data ?? []) as ChangeAnalysis[];
}

export async function getChangeAnalysisImpacts(
  startupId: string,
): Promise<ChangeAnalysisImpact[]> {
  if (!startupId) throw new Error("Startup ID is required.");
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("change_analysis_impacts")
    .select(
      `id, created_at, change_analysis_id, brand_decision_id, impact_type, severity, reason`,
    )
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(
      `Failed to load change analysis impacts: ${error.message}`,
    );
  }

  return (data ?? []) as ChangeAnalysisImpact[];
}

export async function setChangeAnalysisStatus(
  id: string,
  status: Exclude<ChangeAnalysisStatus, "pending">,
): Promise<ChangeAnalysis> {
  if (!id) throw new Error("Change analysis ID is required.");
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("change_analyses")
    .update({
      status,
      reviewed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select()
    .single();

  if (error) {
    throw new Error(
      `Failed to update change analysis status: ${error.message}`,
    );
  }

  return data as ChangeAnalysis;
}
