import type { BrandDecisionCategory, Json } from "@/lib/types/database";
import {
  resolveAiConfig,
  type DiscoveryError,
} from "@/lib/ai/discovery";
import {
  checkLabel,
  checkSeverity,
  needsReviewChecks,
  normalizeBrandChecks,
  type BrandCheck,
  type CheckStatus,
  type CheckType,
} from "@/lib/ai/brand-checks";

export type ChallengeIssue = {
  id: string;
  severity: "high" | "medium" | "low";
  check_type: CheckType;
  status: CheckStatus;
  affected_decision_id: string;
  affected_category: BrandDecisionCategory;
  issue_title: string;
  issue: string;
  evidence: string;
  proposed_alternative: string;
};

export type CriticContextInput = {
  id: string;
  type: string;
  content: string;
};

export type CriticDecisionInput = {
  id: string;
  category: BrandDecisionCategory;
  title: string;
  content: string;
  rationale: string | null;
  supporting_context_ids: string[];
};

export type CriticResult = {
  /** Full five-check result set, including PASS and INSUFFICIENT_EVIDENCE. */
  checks: BrandCheck[];
  /** Legacy projection: only the reviewable findings, for the existing UI. */
  issues: ChallengeIssue[];
};

const JSON_START_RE = /^[\s\uFEFF\u200B]*\{/;
const JSON_END_RE = /\}[\s\uFEFF\u200B]*$/;

function findJson(text: string): string | null {
  const trimmed = text.trim();
  if (JSON_START_RE.test(trimmed) && JSON_END_RE.test(trimmed)) return trimmed;
  const first = trimmed.indexOf("{");
  const last = trimmed.lastIndexOf("}");
  if (first === -1 || last === -1 || last <= first) return null;
  return trimmed.slice(first, last + 1);
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

const CATEGORIES: BrandDecisionCategory[] = [
  "AUDIENCE",
  "POSITIONING",
  "VALUE_PROPOSITION",
  "DIFFERENTIATION",
  "PERSONALITY",
  "NAMING",
  "TAGLINE",
  "VOICE",
  "MESSAGING",
  "VISUAL_DIRECTION",
  "LAUNCH",
];

const CLICHES = `Common brand language that carries no information. Flag it ONLY when the decision has nothing specific to replace it:
- "empowering the next generation", "innovative solutions", "innovative platform", "empower users"
- "next-generation", "revolutionary", "game-changing", "cutting-edge", "best-in-class", "world-class"
- "unlock potential", "seamless experience", "end-to-end solution", "one-stop shop", "holistic approach"
- "actionable insights", "user-centric", "the most trusted", "the easiest way to", "shaping the future"
- "transforming the way people work", "the world's leading", "seamless", "scalable", "robust"`;

const CHECKS = `Run exactly these five checks over the active brand decisions:

1. "generic" — GENERIC / CLICHÉ LANGUAGE
   The decision leans on the banned clichés above and, outside those phrases, says nothing a reader could not say about any other product. Specific wording is NOT generic: if the decision names a real audience, a real capability, or a real situation, it passes this check even when one cliché appears inside it.

2. "contradiction" — DIRECT CONTRADICTION
   Two active decisions state opposite things on the same dimension. Both sides must be quoted. A soft tension, a different emphasis, or a decision that merely fails to mention the other one is NOT a contradiction — use "potential_conflict" for that, and prefer INSUFFICIENT_EVIDENCE when you cannot quote both sides.

3. "bias" — BIAS OR UNGROUNDED FRAMING
   The decision assumes a demographic, ability, culture, geography, or income level without support, excludes a reasonable user segment with no stated reason, or uses coded phrasing. If the approved context does not describe who the users are, you cannot decide whether an assumption is warranted: report INSUFFICIENT_EVIDENCE and say what context is missing. Never invent a bias problem to fill the slot.

4. "audience_mismatch" — AUDIENCE MISMATCH
   A PERSONALITY / VOICE / MESSAGING / TAGLINE decision's vocabulary, tone, references, or implied values do not fit the documented audience. Quote the audience decision and the mismatching wording. Without an active AUDIENCE decision, report INSUFFICIENT_EVIDENCE.

5. "unsupported_claim" — WEAK SPECIFICITY / UNSUPPORTED CLAIM
   The decision asserts a fact, number, ranking, or market conclusion that no supporting context item backs, or the claim is too vague to check ("the best option for teams"). The most common case is a headline claim like "the most trusted platform" with nothing behind it. Quote the claim and name the context that is missing.`;

const SYSTEM_PROMPT = `You are the Brand Critic — a senior brand editor who finds weak spots before launch.

You run five checks over already-approved brand decisions. Every check returns exactly one result per relevant decision with:
- "check_type": "generic" | "contradiction" | "potential_conflict" | "bias" | "audience_mismatch" | "unsupported_claim"
- "status": "PASS" | "NEEDS_REVIEW" | "INSUFFICIENT_EVIDENCE"
- "decision_id": EXACT id from the provided active decisions list. Never invent ids.
- "evidence": array of direct quotes from the decision content (and the other decision, for contradictions) that you relied on. Required for NEEDS_REVIEW.
- "reason": one or two sentences saying what the quoted wording shows. Required for NEEDS_REVIEW.
- "alternative": a concrete rewrite of the affected decision content, not advice. Required for NEEDS_REVIEW.

Status rules — these are the whole point of the exercise:
- PASS: you checked and the wording holds up. Say so in "reason" using the actual wording.
- NEEDS_REVIEW: a real defect you can defend with quoted evidence. Always include evidence, reason, and alternative.
- INSUFFICIENT_EVIDENCE: you cannot judge because the decision or the approved context does not say enough. Use this instead of guessing, and name what is missing. This is a legitimate, expected outcome — it is not a failure and not a defect.

Be strict but fair. Report a NEEDS_REVIEW only when you can quote the wording that proves it. When a decision is genuinely good, return PASS for it. Never manufacture a finding to look thorough, and never invent a contradiction you cannot quote from both sides.

${CLICHES}

${CHECKS}

Return ONLY a single valid JSON object, no prose and no markdown fence:
{
  "checks": [
    {
      "id": "chk_0001",
      "check_type": "generic",
      "status": "NEEDS_REVIEW",
      "decision_id": "<exact id>",
      "evidence": ["<direct quote from the decision>"],
      "reason": "<what the quote shows>",
      "alternative": "<full replacement text for that decision's content>"
    }
  ]
}

Rules:
- Cover the decisions that the five checks actually apply to. A clean brand returns a short list of PASS results, or {"checks": []} if there is nothing to say.
- affected/decision categories must be one of the 11 brand categories: ${CATEGORIES.join(", ")}.
- "alternative" replaces the whole decision content. Preserve any structured ### sections the original uses, and keep the length comparable.
- Never propose alternative wording that uses the banned clichés.
- Do not add commentary beyond the JSON object.`;

function normalizeCategory(raw: unknown): BrandDecisionCategory | null {
  if (typeof raw !== "string") return null;
  const up = raw.trim().toUpperCase();
  return (CATEGORIES as readonly string[]).includes(up)
    ? (up as BrandDecisionCategory)
    : null;
}

function toIssue(check: BrandCheck, decisions: ReadonlyMap<string, CriticDecisionInput>): ChallengeIssue {
  const decision = decisions.get(check.decision_id);
  const title = (decision?.title ?? "").trim();
  const label = checkLabel(check.check_type);
  return {
    id: check.id,
    severity: checkSeverity(check.check_type),
    check_type: check.check_type,
    status: check.status,
    affected_decision_id: check.decision_id,
    affected_category: (normalizeCategory(check.decision_category) ??
      normalizeCategory(decision?.category) ??
      "POSITIONING") as BrandDecisionCategory,
    issue_title: title ? `${label} — ${title}` : label,
    issue: check.reason,
    evidence: check.evidence.join("\n"),
    proposed_alternative: check.alternative ?? check.reason,
  };
}

export function validateCriticResponse(
  raw: unknown,
  decisions: readonly CriticDecisionInput[],
): { ok: true; result: CriticResult } | { ok: false; err: DiscoveryError } {
  if (!isRecord(raw)) {
    return { ok: false, err: { kind: "parse", message: "Critic response is not a JSON object.", raw } };
  }
  const byId = new Map(decisions.map((d) => [d.id, d]));
  const checks = normalizeBrandChecks(raw, {
    validDecisionIds: new Set(byId.keys()),
    decisions: decisions.map((d) => ({
      id: d.id,
      category: d.category,
      title: d.title,
      content: d.content,
    })),
  });
  const issues = needsReviewChecks(checks).map((check) => toIssue(check, byId));
  return { ok: true, result: { checks, issues } };
}

export async function runBrandCritic(
  activeDecisions: readonly CriticDecisionInput[],
  approvedContext: readonly CriticContextInput[],
  methodologyReferences?: string,
): Promise<{ ok: true; result: CriticResult } | { ok: false; err: DiscoveryError }> {
  if (activeDecisions.length === 0) {
    return {
      ok: false,
      err: {
        kind: "model",
        message: "No active brand decisions yet. Generate strategy and approve decisions in the Brand tab first.",
      },
    };
  }
  const cfgRes = resolveAiConfig();
  if (!cfgRes.ok) {
    return { ok: false, err: { kind: "config", message: cfgRes.message } };
  }
  const { cfg } = cfgRes;
  const decisionLines: string[] = [];
  for (const d of activeDecisions) {
    decisionLines.push(
      `- id=${d.id} category=${d.category}\n  title: ${d.title}\n  rationale: ${d.rationale ?? ""}\n  supporting_ids: [${d.supporting_context_ids.join(", ")}]\n  content:\n${d.content
        .split("\n")
        .map((l) => `    ${l}`)
        .join("\n")}`,
    );
  }
  const ctxLines: string[] = [];
  for (const c of approvedContext) {
    ctxLines.push(
      `- id=${c.id} type=${c.type}\n  "${c.content.replace(/\s+/g, " ").trim().slice(0, 280)}"`,
    );
  }
  const methodologyBlock = methodologyReferences?.trim()
    ? `
TRUSTED BRAND-STRATEGY REFERENCES (METHODOLOGY ONLY; NOT STARTUP FACTS OR EVIDENCE):
"""
${methodologyReferences.trim()}
"""
Use these references to sharpen critique standards only. Do not invent startup facts or context ids from them.
`
    : "";

  const userPrompt = `Check the following active brand decisions against the five checks in your instructions.

ACTIVE BRAND DECISIONS (the only allowed values for decision_id):
${decisionLines.join("\n\n")}

APPROVED STARTUP CONTEXT (the only grounding for audience and claim checks — if it does not cover what a check needs, answer INSUFFICIENT_EVIDENCE and name what is missing):
${ctxLines.length > 0 ? ctxLines.join("\n") : "(none)"}

${methodologyBlock}
Quote the exact wording you relied on. Return {"checks": []} if the decisions hold up. Return ONLY the JSON object.`;

  let url: string;
  let headers: Record<string, string>;
  let body: Json;

  if (cfg.provider === "anthropic") {
    url = "https://api.anthropic.com/v1/messages";
    headers = {
      "content-type": "application/json",
      "x-api-key": cfg.apiKey,
      "anthropic-version": "2023-06-01",
    };
    body = {
      model: cfg.model,
      max_tokens: 6000,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: [{ type: "text", text: userPrompt }] }],
    };
  } else if (cfg.provider === "gemini") {
    const base = cfg.endpoint ?? "https://generativelanguage.googleapis.com/v1beta";
    url = `${base}/models/${cfg.model}:generateContent?key=${encodeURIComponent(cfg.apiKey)}`;
    headers = {
      "content-type": "application/json",
      "x-goog-api-client": "living-brand-intelligence-hackathon/1.0",
    };
    body = {
      contents: [
        {
          role: "user",
          parts: [{ text: `${SYSTEM_PROMPT}\n\n${userPrompt}` }],
        },
      ],
      generationConfig: {
        temperature: 0.15,
        maxOutputTokens: 6000,
        responseMimeType: "application/json",
      },
    };
  } else {
    const base =
      cfg.endpoint ??
      (cfg.provider === "openrouter"
        ? "https://openrouter.ai/api/v1"
        : "https://api.openai.com/v1");
    url = `${base}/chat/completions`;
    headers = {
      "content-type": "application/json",
      authorization: `Bearer ${cfg.apiKey}`,
    };
    if (cfg.provider === "openrouter") {
      headers["http-referer"] = "https://living-brand-intelligence.local";
      headers["x-title"] = "Living Brand Intelligence (Hackathon MVP)";
    }
    body = {
      model: cfg.model,
      temperature: 0.15,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userPrompt },
      ],
    };
  }

  let response: Response;
  try {
    response = await fetch(url, { method: "POST", headers, body: JSON.stringify(body), cache: "no-store" });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Network error contacting AI provider.";
    return { ok: false, err: { kind: "model", message: `Unable to reach AI provider: ${message}` } };
  }
  if (!response.ok) {
    let detail = `HTTP ${response.status}`;
    try {
      const txt = await response.text();
      if (txt) detail += `: ${txt.slice(0, 240)}`;
    } catch {
      /* ignore */
    }
    return { ok: false, err: { kind: "model", message: `AI provider returned an error. ${detail}` } };
  }
  let json: unknown;
  try {
    json = await response.json();
  } catch (err) {
    const rawText = err instanceof Error ? err.message : "non-JSON response";
    return { ok: false, err: { kind: "parse", message: "AI provider did not return JSON.", raw: rawText } };
  }
  let contentText = "";
  try {
    if (cfg.provider === "anthropic") {
      const bodyAny = json as Record<string, unknown>;
      const content = bodyAny.content;
      if (Array.isArray(content) && content.length > 0) {
        const first = content[0] as Record<string, unknown>;
        if (typeof first?.text === "string") contentText = first.text;
      }
    } else if (cfg.provider === "gemini") {
      const bodyAny = json as Record<string, unknown>;
      const candidates = bodyAny.candidates;
      if (Array.isArray(candidates) && candidates.length > 0 && isRecord(candidates[0])) {
        const c0 = candidates[0] as Record<string, unknown>;
        const content = c0.content;
        if (isRecord(content)) {
          const parts = (content as Record<string, unknown>).parts;
          if (Array.isArray(parts) && parts.length > 0) {
            const texts: string[] = [];
            for (const p of parts) if (isRecord(p) && typeof p.text === "string") texts.push(p.text);
            if (texts.length > 0) contentText = texts.join("");
          }
        }
      }
      if (!contentText && bodyAny.errorMessage) {
        const msg = typeof bodyAny.errorMessage === "string" ? bodyAny.errorMessage : "";
        return { ok: false, err: { kind: "model", message: `Gemini returned an error: ${msg || "unknown"}`, raw: json } };
      }
    } else {
      const bodyAny = json as Record<string, unknown>;
      const choices = bodyAny.choices;
      if (
        Array.isArray(choices) &&
        choices.length > 0 &&
        isRecord(choices[0]) &&
        isRecord(choices[0].message) &&
        typeof (choices[0].message as Record<string, unknown>).content === "string"
      ) {
        contentText = (choices[0].message as Record<string, unknown>).content as string;
      }
    }
  } catch {
    /* contentText stays empty */
  }
  if (!contentText) {
    return { ok: false, err: { kind: "parse", message: "AI response did not contain message content.", raw: json } };
  }
  const jsonStr = findJson(contentText);
  if (!jsonStr) {
    return {
      ok: false,
      err: { kind: "parse", message: "AI response could not be parsed as structured critique JSON.", raw: contentText.slice(0, 1500) },
    };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonStr);
  } catch {
    return { ok: false, err: { kind: "parse", message: "AI response was not valid JSON.", raw: jsonStr.slice(0, 1500) } };
  }
  return validateCriticResponse(parsed, activeDecisions);
}
