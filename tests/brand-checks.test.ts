import test from "node:test";
import assert from "node:assert/strict";

import {
  normalizeBrandChecks,
  screenGenericLanguage,
} from "@/lib/ai/brand-checks";
import {
  validateCriticResponse,
  type CriticDecisionInput,
} from "@/lib/ai/challenge";
import { validateConsistencyResponse } from "@/lib/ai/consistency";
import type { BrandDecision, BrandDecisionCategory } from "@/lib/types/database";

function decision(
  id: string,
  category: BrandDecisionCategory,
  title: string,
  content: string,
): CriticDecisionInput {
  return {
    id,
    category,
    title,
    content,
    rationale: null,
    supporting_context_ids: [],
  };
}

function criticChecks(raw: unknown, decisions: readonly CriticDecisionInput[]) {
  const res = validateCriticResponse(raw, decisions);
  assert.equal(res.ok, true);
  if (!res.ok) throw new Error("expected ok");
  return res.result;
}

function onlyCheck(
  raw: unknown,
  decisions: readonly CriticDecisionInput[],
) {
  const { checks } = criticChecks(raw, decisions);
  assert.equal(checks.length, 1, "expected exactly one surviving check");
  return checks[0];
}

function guard(raw: unknown, byCategory: Record<string, string>): ReturnType<typeof validateConsistencyResponse> {
  const map = new Map<BrandDecisionCategory, BrandDecision[]>();
  let n = 0;
  for (const [category, title] of Object.entries(byCategory)) {
    map.set(category as BrandDecisionCategory, [
      {
        id: `d${++n}`,
        category: category as BrandDecisionCategory,
        title,
        content: title,
        rationale: null,
        status: "active",
        startup_id: "s1",
        supersedes_id: null,
        created_at: "",
        updated_at: "",
      } as unknown as BrandDecision,
    ]);
  }
  return validateConsistencyResponse(raw, map);
}

const GENERIC_LINE = "Empowering the next generation through innovative solutions.";
const SPECIFIC_LINE = "Help college students find complementary teammates for hackathons.";

test("scenario 1: pure cliché is a generic NEEDS_REVIEW, even when the model passes it", () => {
  const decisions = [decision("d1", "TAGLINE", "Tagline", GENERIC_LINE)];
  const check = onlyCheck(
    {
      checks: [
        {
          check_type: "generic",
          status: "PASS",
          decision_id: "d1",
          reason: "No cliché found.",
          evidence: [],
        },
      ],
    },
    decisions,
  );
  assert.equal(check.status, "NEEDS_REVIEW");
  assert.equal(check.check_type, "generic");
  assert.ok(check.evidence.length > 0, "a NEEDS_REVIEW must carry evidence");
  assert.ok(check.alternative && check.alternative.length > 0, "a NEEDS_REVIEW must offer a grounded alternative");
  const { issues } = criticChecks(
    {
      checks: [
        {
          check_type: "generic",
          status: "PASS",
          decision_id: "d1",
          reason: "No cliché found.",
        },
      ],
    },
    decisions,
  );
  assert.equal(issues.length, 1, "the founder sees the finding as a reviewable issue");
  assert.equal(issues[0].check_type, "generic");
});

test("scenario 2: specific wording passes the generic check without a false positive", () => {
  const decisions = [decision("d1", "VALUE_PROPOSITION", "Value prop", SPECIFIC_LINE)];
  const check = onlyCheck(
    {
      checks: [
        {
          check_type: "generic",
          status: "PASS",
          decision_id: "d1",
          reason: "Names a concrete audience, action, and context.",
        },
      ],
    },
    decisions,
  );
  assert.equal(check.status, "PASS");
  assert.equal(check.alternative, null);
  assert.equal(screenGenericLanguage(SPECIFIC_LINE).status, "PASS");
  assert.equal(screenGenericLanguage(GENERIC_LINE).status, "NEEDS_REVIEW");
});

test("scenario 3: audience mismatch is kept, and an unevidenced finding is downgraded", () => {
  const decisions = [
    decision("aud", "AUDIENCE", "Audience", "College students building hackathon projects."),
    decision("msg", "MESSAGING", "Messaging", "Enterprise-grade procurement infrastructure."),
  ];
  const evidenced = onlyCheck(
    {
      checks: [
        {
          check_type: "audience_mismatch",
          status: "NEEDS_REVIEW",
          decision_id: "msg",
          evidence: ['"Enterprise-grade procurement infrastructure."'],
          reason:
            'Audience is "college students building hackathon projects"; messaging speaks to enterprise procurement buyers.',
          alternative: "Tell college students which hackathon teammates to build with, and why.",
        },
      ],
    },
    decisions,
  );
  assert.equal(evidenced.status, "NEEDS_REVIEW");
  assert.equal(evidenced.check_type, "audience_mismatch");

  const unevidenced = onlyCheck(
    {
      checks: [
        {
          check_type: "audience_mismatch",
          status: "NEEDS_REVIEW",
          decision_id: "msg",
          reason: "This does not fit the audience.",
        },
      ],
    },
    decisions,
  );
  assert.equal(unevidenced.status, "INSUFFICIENT_EVIDENCE");
  assert.equal(unevidenced.alternative, null, "an unproven finding offers nothing to apply");
});

test("scenario 4: aligned personality and voice stay a consistency PASS", () => {
  const res = guard(
    {
      pair_results: [
        {
          pair: "Personality ↔ Voice",
          result: "PASS",
          evidence: ['Personality: "friendly and encouraging"', 'Voice: "clear and direct"'],
          explanation:
            'Personality says "friendly and encouraging"; voice says "clear and direct" for the same college-student audience; the tones are compatible.',
          suggested_fix: null,
        },
      ],
    },
    { PERSONALITY: "Friendly and encouraging for college students", VOICE: "Clear and direct" },
  );
  assert.equal(res.ok, true);
  if (!res.ok) return;
  const row = res.result.pair_results.find((p) => p.pair === "Personality ↔ Voice");
  assert.equal(row?.result, "PASS");
  assert.equal(row?.checked, true);
  assert.equal(row?.evidence.length, 2);

  const others = res.result.pair_results.filter((p) => p.result === "NOT_CHECKED");
  assert.equal(others.length, 8, "pairs with a missing side are not judged");
  assert.ok(others.every((p) => p.checked === false));
});

test("scenario 5: privacy versus public exposure is an evidence-backed NEEDS_REVIEW", () => {
  const res = guard(
    {
      pair_results: [
        {
          pair: "Personality ↔ Messaging",
          result: "CONFLICT",
          evidence: [
            'Personality: "privacy is central to how we treat students"',
            'Messaging: "Encourage users to publicly expose personal contact details."',
          ],
          explanation:
            'Personality calls privacy central; messaging tells users to publish their contact details; the two point in opposite directions.',
          suggested_fix: "Reword the messaging ask to share contact details privately with matched teammates.",
        },
      ],
    },
    {
      PERSONALITY: "Privacy is central to how we treat students",
      MESSAGING: "Encourage users to publicly expose personal contact details.",
    },
  );
  assert.equal(res.ok, true);
  if (!res.ok) return;
  const row = res.result.pair_results.find((p) => p.pair === "Personality ↔ Messaging");
  assert.equal(row?.result, "NEEDS_REVIEW");
  assert.equal(row?.evidence.length, 2);
  assert.ok(row?.suggested_fix, "a reviewable pair hands the founder an alignment edit");
  assert.equal(row?.checked, true);

  const unevidenced = guard(
    {
      pair_results: [
        {
          pair: "Personality ↔ Messaging",
          result: "NEEDS_REVIEW",
          explanation: "These two do not line up.",
          suggested_fix: "Align them.",
        },
      ],
    },
    {
      PERSONALITY: "Privacy is central to how we treat students",
      MESSAGING: "Encourage users to publicly expose personal contact details.",
    },
  );
  assert.equal(unevidenced.ok, true);
  if (!unevidenced.ok) return;
  const bare = unevidenced.result.pair_results.find((p) => p.pair === "Personality ↔ Messaging");
  assert.equal(bare?.result, "INSUFFICIENT_EVIDENCE", "an unquoted conflict is never reported as a finding");
  assert.equal(bare?.suggested_fix, null);
});

test("scenario 6: an unsupported headline claim is a reviewable unsupported_claim", () => {
  const decisions = [
    decision("pos", "POSITIONING", "Positioning", "The most trusted student platform."),
  ];
  const check = onlyCheck(
    {
      checks: [
        {
          check_type: "unsupported_claim",
          status: "NEEDS_REVIEW",
          decision_id: "pos",
          evidence: ['"The most trusted student platform."'],
          reason:
            "No approved context item backs a trust ranking, so the claim cannot be defended.",
          alternative: "Remove the ranking and state what the platform does for students.",
        },
      ],
    },
    decisions,
  );
  assert.equal(check.status, "NEEDS_REVIEW");
  assert.equal(check.check_type, "unsupported_claim");
  assert.equal(check.decision_id, "pos");
  assert.ok(check.alternative);
});

test("scenario 7: missing bias context yields INSUFFICIENT_EVIDENCE, not an invented problem", () => {
  const decisions = [decision("pos", "POSITIONING", "Positioning", "A platform for ambitious builders everywhere.")];
  const check = onlyCheck(
    {
      checks: [
        {
          check_type: "bias",
          status: "INSUFFICIENT_EVIDENCE",
          decision_id: "pos",
          evidence: [],
          reason:
            "No approved context describes who the users are, so no assumption can be tested for bias.",
        },
      ],
    },
    decisions,
  );
  assert.equal(check.status, "INSUFFICIENT_EVIDENCE");
  assert.equal(check.check_type, "bias");
  const { issues } = criticChecks(
    {
      checks: [
        {
          check_type: "bias",
          status: "INSUFFICIENT_EVIDENCE",
          decision_id: "pos",
          reason: "No approved context describes who the users are.",
        },
      ],
    },
    decisions,
  );
  assert.equal(issues.length, 0, "an ungrounded check is not presented as a defect");
});

test("unknown decision ids, check types, and statuses are dropped", () => {
  const checks = normalizeBrandChecks(
    {
      checks: [
        { check_type: "generic", status: "NEEDS_REVIEW", decision_id: "nope", evidence: ["x"], reason: "y" },
        { check_type: "vibes", status: "NEEDS_REVIEW", decision_id: "d1", evidence: ["x"], reason: "y" },
        { check_type: "generic", status: "MAYBE", decision_id: "d1", evidence: ["x"], reason: "y" },
      ],
    },
    { validDecisionIds: new Set(["d1"]), decisions: [{ id: "d1", category: "TAGLINE", content: GENERIC_LINE }] },
  );
  assert.equal(checks.length, 0);
});
