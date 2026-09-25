"use server";

import type { ContextItem } from "@/lib/types/database";
import { getStartup } from "@/lib/db/startups";
import { getContextItems } from "@/lib/db/context";
import {
  runInterviewTurn,
  type InterviewAnswer,
  type InterviewQuestion,
  type InterviewSummary,
  type UnderstandingLine,
} from "@/lib/ai/dialogue";

export type InterviewActionState = {
  error?: string;
  configError?: boolean;
  stage?: "question" | "summary";
  question?: InterviewQuestion;
  understanding?: UnderstandingLine[];
  summary?: InterviewSummary;
  scopeQuestion?: string | null;
  closing?: string | null;
  transcript?: InterviewAnswer[];
};

const MAX_TRANSCRIPT_JSON = 24000;
const MAX_TURNS = 9;

function parseTranscript(raw: string | null): InterviewAnswer[] {
  if (!raw) return [];
  if (raw.length > MAX_TRANSCRIPT_JSON) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  const out: InterviewAnswer[] = [];
  for (const entry of parsed) {
    if (out.length >= 20) break;
    if (typeof entry !== "object" || entry === null) continue;
    const record = entry as Record<string, unknown>;
    const question =
      typeof record.question === "string" ? record.question.trim().slice(0, 400) : "";
    const answer = typeof record.answer === "string" ? record.answer.trim().slice(0, 3000) : "";
    if (!question || !answer) continue;
    out.push({ question, answer });
  }
  return out;
}

/**
 * One adaptive interview turn. The client owns the transcript and posts it back;
 * nothing is persisted here — only founder-approved items ever reach the database,
 * through the existing Discovery review actions.
 */
export async function runInterviewTurnAction(
  _state: InterviewActionState | undefined,
  formData: FormData,
): Promise<InterviewActionState> {
  void _state;

  const startupId = formData.get("startupId")?.toString() ?? "";
  if (!startupId) return { error: "Startup ID is required." };

  let roughIdea = "";
  try {
    const startup = await getStartup(startupId);
    if (!startup) return { error: "Startup no longer exists." };
    roughIdea = startup.raw_idea?.trim() ?? "";
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not load startup.";
    return { error: message };
  }
  if (!roughIdea) {
    return {
      error:
        "There is no rough idea to explore. Return to the first step and describe what you're building.",
    };
  }

  const transcript = parseTranscript(formData.get("transcript")?.toString() ?? null);
  const askedTurns = new Set(transcript.map((a) => a.question)).size;
  const forceSummary = formData.get("forceSummary")?.toString() === "1" || askedTurns >= MAX_TURNS;

  let approvedContext: ContextItem[] = [];
  try {
    const rows = await getContextItems(startupId);
    approvedContext = rows.filter(
      (c) =>
        c.status === "active" &&
        (c.type === "FACT" || c.type === "INFERENCE" || c.type === "HYPOTHESIS"),
    );
  } catch {
    approvedContext = [];
  }

  const res = await runInterviewTurn({
    roughIdea,
    transcript,
    approvedContext: approvedContext.map((c) => ({
      id: c.id,
      type: c.type,
      content: c.content,
    })),
    forceSummary,
  });

  if (!res.ok) {
    const e = res.err;
    if (e.kind === "config") return { configError: true, error: e.message, transcript };
    if (e.kind === "parse") {
      console.error("[interview:parse]", e.message, e.raw);
      return { error: e.message, transcript };
    }
    console.error("[interview:model]", e.message, e.raw);
    return { error: e.message, transcript };
  }

  const turn = res.result;
  if (turn.stage === "question") {
    return {
      stage: "question",
      question: turn.question,
      understanding: turn.understanding,
      transcript,
    };
  }

  return {
    stage: "summary",
    summary: turn.summary,
    scopeQuestion: turn.scopeQuestion,
    understanding: turn.understanding,
    closing: turn.closing,
    transcript,
  };
}
