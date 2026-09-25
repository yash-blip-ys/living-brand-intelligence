"use server";

import { redirect } from "next/navigation";
import { createStartup } from "@/lib/db/startups";

export type StartupActionState = {
  error?: string;
};

export async function createStartupAction(
  state: StartupActionState | undefined,
  formData: FormData,
): Promise<StartupActionState> {
  const rawIdea = formData.get("rawIdea")?.toString() ?? "";

  const trimmed = rawIdea.trim();
  if (!trimmed) {
    return { error: "Please describe what you're building." };
  }

  let startupId: string;
  try {
    const startup = await createStartup(trimmed);
    startupId = startup.id;
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Could not create startup.";
    return { error: message };
  }

  redirect(`/startups/${startupId}`);
}
