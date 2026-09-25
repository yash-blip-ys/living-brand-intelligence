import { createClient } from "@/lib/server";
import type { Json, Startup } from "@/lib/types/database";

export async function createStartup(
  rawIdea: string,
): Promise<Startup> {
  const trimmed = rawIdea.trim();
  if (!trimmed) {
    throw new Error("Startup idea cannot be empty.");
  }

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("startups")
    .insert({ name: "Untitled startup", raw_idea: trimmed })
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to create startup: ${error.message}`);
  }

  return data as Startup;
}

export async function getStartup(
  id: string,
): Promise<Startup | null> {
  if (!id) {
    throw new Error("Startup ID is required.");
  }

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("startups")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load startup: ${error.message}`);
  }

  return data as Startup | null;
}

/**
 * Stores the outcome of a finished Challenge run on the startup it belongs to,
 * so stage completion and the Quality cards can be derived from the run itself
 * after a reload instead of from client state.
 */
export async function saveChallengeRun(
  startupId: string,
  run: Json,
): Promise<void> {
  if (!startupId) throw new Error("Startup ID is required.");

  const supabase = await createClient();

  const { error } = await supabase
    .from("startups")
    .update({ challenge_run: run, updated_at: new Date().toISOString() })
    .eq("id", startupId);

  if (error) {
    throw new Error(`Failed to save challenge run: ${error.message}`);
  }
}
