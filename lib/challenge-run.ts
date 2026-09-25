import type { ChallengeIssue } from "@/lib/ai/challenge";
import type { BrandCheck } from "@/lib/ai/brand-checks";

/** What a finished Challenge run actually returned. */
export type ChallengeRunSummary = {
  status: "complete" | "error";
  /** Reviewable findings, exactly as the run returned them. */
  issueCount: number;
  high: number;
  medium: number;
  low: number;
  /** Total checks the critic reported, including passes. */
  checksRun: number;
  /** Checks that could not be grounded, so no verdict was reported. */
  ungrounded: number;
  error?: string;
};

/**
 * Projects a finished run into the summary the tab badge and the Quality cards
 * read. Shared by the server action that persists the run and the client that
 * publishes it, so what is stored and what is displayed cannot drift.
 */
export function summarizeChallengeRun(
  issues: readonly ChallengeIssue[],
  checks: readonly BrandCheck[],
): ChallengeRunSummary {
  return {
    status: "complete",
    issueCount: issues.length,
    high: issues.filter((i) => i.severity === "high").length,
    medium: issues.filter((i) => i.severity === "medium").length,
    low: issues.filter((i) => i.severity === "low").length,
    checksRun: checks.length,
    ungrounded: checks.filter((c) => c.status === "INSUFFICIENT_EVIDENCE").length,
  };
}

/**
 * Reads the persisted run back. Returns null for a startup that has never run
 * Challenge, and for anything that is not a well-formed stored summary, so
 * completion is never granted by a malformed row.
 */
export function parseChallengeRun(value: unknown): ChallengeRunSummary | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }
  const raw = value as Record<string, unknown>;
  const counts = ["issueCount", "high", "medium", "low", "checksRun", "ungrounded"];
  for (const key of counts) {
    if (typeof raw[key] !== "number" || !Number.isFinite(raw[key] as number)) {
      return null;
    }
  }
  if (raw.status !== "complete" && raw.status !== "error") return null;
  const summary: ChallengeRunSummary = {
    status: raw.status,
    issueCount: raw.issueCount as number,
    high: raw.high as number,
    medium: raw.medium as number,
    low: raw.low as number,
    checksRun: raw.checksRun as number,
    ungrounded: raw.ungrounded as number,
  };
  if (typeof raw.error === "string") summary.error = raw.error;
  return summary;
}
