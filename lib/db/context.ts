import { createClient } from "@/lib/server";
import type {
  ContextItem,
  ContextItemType,
  ContextItemStatus,
  Database,
  Json,
} from "@/lib/types/database";

type ContextItemInsert =
  Database["public"]["Tables"]["context_items"]["Insert"];

type NewContextItemInput = {
  startup_id: string;
  type: ContextItemType;
  content: string;
  status?: ContextItemStatus;
  source?: string | null;
  confidence?: number | null;
  metadata?: Json | null;
};

export async function createContextItems(
  items: readonly NewContextItemInput[],
): Promise<ContextItem[]> {
  if (items.length === 0) return [];

  const rows: ContextItemInsert[] = items.map((it) => ({
    startup_id: it.startup_id,
    type: it.type,
    content: it.content,
    status: it.status ?? "active",
    source: it.source ?? null,
    confidence: it.confidence ?? null,
    metadata: it.metadata ?? null,
  }));

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("context_items")
    .insert(rows)
    .select();

  if (error) {
    throw new Error(`Failed to create context items: ${error.message}`);
  }

  return (data ?? []) as ContextItem[];
}

export async function getContextItems(
  startupId: string,
): Promise<ContextItem[]> {
  if (!startupId) {
    throw new Error("Startup ID is required.");
  }

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("context_items")
    .select("*")
    .eq("startup_id", startupId)
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(`Failed to load context items: ${error.message}`);
  }

  return (data ?? []) as ContextItem[];
}

export async function approveContextItem(id: string): Promise<ContextItem> {
  if (!id) throw new Error("Context item ID is required.");

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("context_items")
    .update({ status: "active", updated_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to approve context item: ${error.message}`);
  }

  return data as ContextItem;
}

export async function rejectContextItem(
  id: string,
  reason?: string | null,
): Promise<ContextItem> {
  if (!id) throw new Error("Context item ID is required.");

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("context_items")
    .update({
      type: "REJECTED",
      status: "archived",
      rejection_reason: reason?.trim() || null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to reject context item: ${error.message}`);
  }

  return data as ContextItem;
}
