import { createClient } from "@/lib/server";
import type {
  BrandDecision,
  BrandDecisionCategory,
  BrandDecisionStatus,
  Database,
  DecisionContextLinkType,
} from "@/lib/types/database";

type BrandDecisionInsert =
  Database["public"]["Tables"]["brand_decisions"]["Insert"];

type DecisionContextLinkInsert =
  Database["public"]["Tables"]["decision_context_links"]["Insert"];

export type NewBrandDecisionInput = {
  startup_id: string;
  category: BrandDecisionCategory;
  title: string;
  content: string;
  rationale?: string | null;
  status?: BrandDecisionStatus;
  supersedes_id?: string | null;
};

export type NewDecisionContextLinkInput = {
  decision_id: string;
  context_item_id: string;
  relationship_type?: DecisionContextLinkType;
};

export async function createBrandDecisions(
  items: readonly NewBrandDecisionInput[],
): Promise<BrandDecision[]> {
  if (items.length === 0) return [];

  const rows: BrandDecisionInsert[] = items.map((it) => ({
    startup_id: it.startup_id,
    category: it.category,
    title: it.title,
    content: it.content,
    rationale: it.rationale ?? null,
    status: it.status ?? "proposed",
    supersedes_id: it.supersedes_id ?? null,
  }));

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("brand_decisions")
    .insert(rows)
    .select();

  if (error) {
    throw new Error(`Failed to create brand decisions: ${error.message}`);
  }

  return (data ?? []) as BrandDecision[];
}

export async function createDecisionContextLinks(
  items: readonly NewDecisionContextLinkInput[],
): Promise<void> {
  if (items.length === 0) return;

  const rows: DecisionContextLinkInsert[] = items.map((it) => ({
    decision_id: it.decision_id,
    context_item_id: it.context_item_id,
    relationship_type: it.relationship_type ?? "supports",
  }));

  const supabase = await createClient();

  const { error } = await supabase
    .from("decision_context_links")
    .insert(rows);

  if (error) {
    throw new Error(
      `Failed to create decision-context links: ${error.message}`,
    );
  }
}

export async function getBrandDecisions(
  startupId: string,
): Promise<BrandDecision[]> {
  if (!startupId) throw new Error("Startup ID is required.");

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("brand_decisions")
    .select("*")
    .eq("startup_id", startupId)
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(`Failed to load brand decisions: ${error.message}`);
  }

  return (data ?? []) as BrandDecision[];
}

export type DecisionContextSupport = {
  decision_id: string;
  context_item_id: string;
  relationship_type: DecisionContextLinkType;
};

export async function getDecisionContextLinks(
  startupId: string,
): Promise<DecisionContextSupport[]> {
  if (!startupId) throw new Error("Startup ID is required.");

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("decision_context_links")
    .select("decision_id, context_item_id, relationship_type")
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(
      `Failed to load decision-context links: ${error.message}`,
    );
  }

  const all = (data ?? []) as Array<{
    decision_id: string;
    context_item_id: string;
    relationship_type: DecisionContextLinkType;
  }>;

  return all.map((row) => ({
    decision_id: row.decision_id,
    context_item_id: row.context_item_id,
    relationship_type: row.relationship_type,
  }));
}

export async function markCategorySiblingsSuperseded(
  startupId: string,
  category: BrandDecisionCategory,
  newDecisionId: string,
): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("brand_decisions")
    .update({
      status: "superseded",
      supersedes_id: newDecisionId,
      updated_at: new Date().toISOString(),
    })
    .eq("startup_id", startupId)
    .eq("category", category)
    .eq("status", "active")
    .neq("id", newDecisionId);
  if (error) {
    throw new Error(
      `Failed to mark category siblings superseded: ${error.message}`,
    );
  }
}

export async function approveBrandDecision(
  id: string,
): Promise<BrandDecision> {
  if (!id) throw new Error("Brand decision ID is required.");

  const supabase = await createClient();

  const existing = await supabase
    .from("brand_decisions")
    .select("id, startup_id, category, status")
    .eq("id", id)
    .maybeSingle();
  if (existing.error) {
    throw new Error(
      `Failed to load brand decision for approval: ${existing.error.message}`,
    );
  }
  if (!existing.data) {
    throw new Error("Brand decision no longer exists.");
  }

  const { data, error } = await supabase
    .from("brand_decisions")
    .update({ status: "active", updated_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to approve brand decision: ${error.message}`);
  }

  const approved = data as BrandDecision;

  await markCategorySiblingsSuperseded(
    approved.startup_id,
    approved.category,
    approved.id,
  );

  return approved;
}

export async function rejectBrandDecision(
  id: string,
): Promise<BrandDecision> {
  if (!id) throw new Error("Brand decision ID is required.");

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("brand_decisions")
    .update({ status: "rejected", updated_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to reject brand decision: ${error.message}`);
  }

  return data as BrandDecision;
}
