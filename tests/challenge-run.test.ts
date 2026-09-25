import test from "node:test";
import assert from "node:assert/strict";

import {
  parseChallengeRun,
  summarizeChallengeRun,
} from "@/lib/challenge-run";
import type { ChallengeIssue } from "@/lib/ai/challenge";
import type { BrandCheck } from "@/lib/ai/brand-checks";

function issue(severity: "high" | "medium" | "low"): ChallengeIssue {
  return {
    id: `issue_${severity}`,
    severity,
    title: `t_${severity}`,
    summary: `s_${severity}`,
    detail: "d",
    category: "POSITIONING",
  } as unknown as ChallengeIssue;
}

function check(status: BrandCheck["status"]): BrandCheck {
  return {
    key: "k",
    label: "l",
    status,
    detail: "d",
  } as unknown as BrandCheck;
}

test("a run is summarised from what the run returned", () => {
  const summary = summarizeChallengeRun(
    [issue("high"), issue("high"), issue("low")],
    [check("PASS"), check("NEEDS_REVIEW"), check("INSUFFICIENT_EVIDENCE")],
  );
  assert.deepEqual(summary, {
    status: "complete",
    issueCount: 3,
    high: 2,
    medium: 0,
    low: 1,
    checksRun: 3,
    ungrounded: 1,
  });
});

test("a run that found nothing is still a completed run", () => {
  const summary = summarizeChallengeRun([], [check("PASS")]);
  assert.equal(summary.status, "complete");
  assert.equal(summary.issueCount, 0);
  assert.equal(summary.checksRun, 1);
});

test("a persisted summary round-trips, so completion survives a reload", () => {
  const stored = summarizeChallengeRun([issue("medium")], [check("PASS")]);
  assert.deepEqual(parseChallengeRun(JSON.parse(JSON.stringify(stored))), stored);
});

test("a missing or malformed stored run never grants completion", () => {
  assert.equal(parseChallengeRun(null), null);
  assert.equal(parseChallengeRun(undefined), null);
  assert.equal(parseChallengeRun("complete"), null);
  assert.equal(parseChallengeRun([{ status: "complete" }]), null);
  assert.equal(parseChallengeRun({ status: "complete" }), null);
  assert.equal(
    parseChallengeRun({
      status: "complete",
      issueCount: 0,
      high: 0,
      medium: 0,
      low: 0,
      checksRun: "many",
      ungrounded: 0,
    }),
    null,
  );
});
