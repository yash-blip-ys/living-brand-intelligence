import type { BrandDecision, BrandDecisionCategory, Json } from "@/lib/types/database";
import {
  resolveAiConfig,
  type DiscoveryError,
} from "@/lib/ai/discovery";

export const PAIRS: string[] = [
  "Audience ↔ Positioning",
  "Positioning ↔ Value Proposition",
  "Positioning ↔ Differentiation",
  "Personality ↔ Voice",
  "Personality ↔ Messaging",
  "Naming ↔ Personality",
  "Tagline ↔ Positioning",
  "Visual Direction ↔ Personality",
  "Launch ↔ Voice/Positioning",
];

export const PAIR_CATEGORIES: Array<[string, BrandDecisionCategory[]]> = [
  ["Audience ↔ Positioning", ["AUDIENCE", "POSITIONING"]],
  ["Positioning ↔ Value Proposition", ["POSITIONING", "VALUE_PROPOSITION"]],
  ["Positioning ↔ Differentiation", ["POSITIONING", "DIFFERENTIATION"]],
  ["Personality ↔ Voice", ["PERSONALITY", "VOICE"]],
  ["Personality ↔ Messaging", ["PERSONALITY", "MESSAGING"]],
  ["Naming ↔ Personality", ["NAMING", "PERSONALITY"]],
  ["Tagline ↔ Positioning", ["TAGLINE", "POSITIONING"]],
  ["Visual Direction ↔ Personality", ["VISUAL_DIRECTION", "PERSONALITY"]],
  ["Launch ↔ Voice/Positioning", ["LAUNCH", "VOICE", "POSITIONING"]],
];

/**
 * How a relationship between two decisions was judged.
 *
 * PASS / NEEDS_REVIEW / INSUFFICIENT_EVIDENCE are the evaluated outcomes.
 * NOT_CHECKED is internal: it only appears when one side of the pair has no
 * active decision, so there was nothing to compare.
 */
export type ConsistencyResult =
  | "PASS"
  | "NEEDS_REVIEW"
  | "INSUFFICIENT_EVIDENCE"
  | "NOT_CHECKED";

export type ConsistencyPairResult = {
  pair: string;
  result: ConsistencyResult;
  /** False only for NOT_CHECKED: one side had no active decision. */
  checked: boolean;
  /** Direct quotes from the decisions that the verdict rests on. */
  evidence: string[];
  explanation: string;
  suggested_fix: string | null;
};

const CATEGORY_LABEL: Record<string, string> = {
  AUDIENCE: "Audience",
  POSITIONING: "Positioning",
  VALUE_PROPOSITION: "Value proposition",
  DIFFERENTIATION: "Differentiation",
  PERSONALITY: "Personality",
  NAMING: "Naming",
  TAGLINE: "Tagline",
  VOICE: "Voice",
  MESSAGING: "Messaging",
  VISUAL_DIRECTION: "Visual direction",
  LAUNCH: "Launch",
};

function label(cat: string): string {
  return CATEGORY_LABEL[cat] ?? cat;
}

type ConsistencyRaw = { pair_results?: unknown[] };

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

const SYSTEM_PROMPT = `You are the Consistency Guardian — a senior strategist who cross-checks brand decisions for internal alignment.

Check each of the 9 decision pairs below exactly once and return:
- "pair": the exact pair label from the list, verbatim
- "result": "PASS" | "NEEDS_REVIEW" | "INSUFFICIENT_EVIDENCE" | "NOT_CHECKED"
- "evidence": an array of direct quotes taken from the decision content, at least one per side you relied on. Required for PASS and NEEDS_REVIEW.
- "explanation": 1-2 short sentences saying what each side actually states and what follows. Preferred shape: "A says X; B says Y; therefore Z". Never use unearned certainty such as "align precisely", "reinforce each other seamlessly", "perfectly consistent", "fully aligned", or "no issues".
- "suggested_fix": null for PASS, NOT_CHECKED, and INSUFFICIENT_EVIDENCE. For NEEDS_REVIEW, one concrete alignment edit that does not invent facts the decisions do not contain.

The 9 pairs (process ALL nine exactly once):
1. Audience ↔ Positioning
2. Positioning ↔ Value Proposition
3. Positioning ↔ Differentiation
4. Personality ↔ Voice
5. Personality ↔ Messaging
6. Naming ↔ Personality
7. Tagline ↔ Positioning
8. Visual Direction ↔ Personality
9. Launch ↔ Voice/Positioning

Result definitions:
- PASS: both sides have an active decision, and the quoted wording supports the same values, audience, and tone. You must be able to quote both sides; if you cannot, use INSUFFICIENT_EVIDENCE.
- NEEDS_REVIEW: both sides exist and the quoted wording points in different directions, so an edit would align them. A direct contradiction is also NEEDS_REVIEW — state plainly which side contradicts which.
- INSUFFICIENT_EVIDENCE: both sides exist but the wording is too thin to judge this relationship, or the two sides never actually touch the same dimension. Name what is missing. Never guess to avoid this status.
- NOT_CHECKED: one or both sides have no active decision, so there was nothing to compare. Never use PASS for this.

Rules:
- Return exactly 9 entries in pair_results — one for EACH pair label above. Order does not matter, but every label must appear verbatim.
- If one or both sides of a pair is MISSING from the provided active decisions, return NOT_CHECKED and name the missing category in the explanation. Do not return PASS for a pair you could not compare.
- Do not invent new pairs. Do not skip pairs.
- Do not report a contradiction you cannot quote from both sides, and do not report a PASS you cannot quote.
- Return ONLY one JSON object:
{
  "pair_results": [
    {"pair": "Audience ↔ Positioning", "result": "PASS", "evidence": ["...", "..."], "explanation": "...", "suggested_fix": null},
    ... 8 more ...
  ]
}`;

function normalizeResult(raw: unknown): ConsistencyResult | null {
  if (typeof raw !== "string") return null;
  const t = raw.trim().toUpperCase().replace(/[\s-]+/g, "_");
  if (t === "PASS") return "PASS";
  if (t === "NEEDS_REVIEW" || t === "CONFLICT") return "NEEDS_REVIEW";
  if (t === "INSUFFICIENT_EVIDENCE" || t === "UNCLEAR" || t === "UNVERIFIABLE") {
    return "INSUFFICIENT_EVIDENCE";
  }
  if (t === "NOT_CHECKED" || t === "SKIPPED") return "NOT_CHECKED";
  return null;
}

function normalizeEvidence(raw: unknown): string[] {
  const out: string[] = [];
  if (Array.isArray(raw)) {
    for (const entry of raw) {
      if (typeof entry !== "string") continue;
      const t = entry.trim().slice(0, 400);
      if (t && !out.includes(t)) out.push(t);
      if (out.length >= 8) break;
    }
  } else if (typeof raw === "string") {
    const t = raw.trim().slice(0, 400);
    if (t) out.push(t);
  }
  return out;
}

/**
 * A pair can only be judged when every side has at least one active decision.
 * Returns an evidence-based explanation when the pair is not evaluable, else null.
 */
function describeUnevaluablePair(
  cats: BrandDecisionCategory[],
  decisionsByCategory: Map<BrandDecisionCategory, BrandDecision[]>,
): string | null {
  const missing = cats.filter((c) => (decisionsByCategory.get(c)?.length ?? 0) === 0);
  if (missing.length === 0) return null;
  const present = cats
    .map((c) => (decisionsByCategory.get(c) ?? [])[0])
    .filter((d): d is BrandDecision => Boolean(d))
    .map((d) => `${label(d.category)} says "${d.title.trim().slice(0, 120)}"`);
  const missingText = missing.map(label).join(missing.length > 1 ? " and " : "");
  const presentText = present.length > 0 ? `${present.join("; ")}.` : "";
  return `${missingText} has no active decision, so this pair was not evaluated. ${presentText}`.trim();
}

export function validateConsistencyResponse(
  raw: unknown,
  decisionsByCategory: Map<BrandDecisionCategory, BrandDecision[]>,
): { ok: true; result: { pair_results: ConsistencyPairResult[] } } | { ok: false; err: DiscoveryError } {
  if (!isRecord(raw)) {
    return { ok: false, err: { kind: "parse", message: "Consistency response is not a JSON object.", raw } };
  }
  const dto = raw as ConsistencyRaw;
  const arr = Array.isArray(dto.pair_results) ? dto.pair_results : [];
  const byPair = new Map<string, ConsistencyPairResult>();
  for (const row of arr) {
    if (!isRecord(row)) continue;
    const pair = typeof row.pair === "string" ? row.pair : "";
    let result = normalizeResult(row.result);
    if (!PAIRS.includes(pair) || !result) continue;
    if (byPair.has(pair)) continue;
    const explanation =
      typeof row.explanation === "string" ? row.explanation.trim().slice(0, 2000) : "";
    if (!explanation) continue;
    let evidence = normalizeEvidence(row.evidence);
    // A verdict that cannot quote the wording it rests on is not a verdict.
    // An evidence-free finding is reported as unproven, never as a conflict.
    if (evidence.length === 0 && (result === "PASS" || result === "NEEDS_REVIEW")) {
      result = "INSUFFICIENT_EVIDENCE";
    }
    const fixRaw = row.suggested_fix;
    const suggested_fix =
      result === "NEEDS_REVIEW" && typeof fixRaw === "string" && fixRaw.trim().length > 0
        ? fixRaw.trim().slice(0, 3000)
        : null;
    if (result === "INSUFFICIENT_EVIDENCE" && evidence.length === 0) {
      evidence = [`No quotable wording was returned for this pair: ${explanation}`];
    }
    byPair.set(pair, {
      pair,
      result,
      checked: result !== "NOT_CHECKED",
      evidence,
      explanation,
      suggested_fix,
    });
  }
  // Status correction: a pair with a missing side is never judged. Omitted pairs
  // are filled conservatively based on whether there is anything to compare.
  for (const [pair, cats] of PAIR_CATEGORIES) {
    const unevaluable = describeUnevaluablePair(cats, decisionsByCategory);
    if (unevaluable) {
      byPair.set(pair, {
        pair,
        result: "NOT_CHECKED",
        checked: false,
        evidence: [unevaluable],
        explanation: unevaluable,
        suggested_fix: null,
      });
    } else if (!byPair.has(pair)) {
      byPair.set(pair, {
        pair,
        result: "INSUFFICIENT_EVIDENCE",
        checked: true,
        evidence: [],
        explanation:
          "The consistency evaluator returned no result for this pair even though both decisions exist, so this relationship is unverified. Re-run the check before treating the brand as consistent.",
        suggested_fix: null,
      });
    }
  }
  const pair_results = PAIRS.map((p) => byPair.get(p)!).filter(Boolean);
  return { ok: true, result: { pair_results } };
}

export async function runConsistencyGuardian(
  decisionsByCategory: Map<BrandDecisionCategory, BrandDecision[]>,
  methodologyReferences?: string,
): Promise<{ ok: true; result: { pair_results: ConsistencyPairResult[] } } | { ok: false; err: DiscoveryError }> {
  const cfgRes = resolveAiConfig();
  if (!cfgRes.ok) {
    return { ok: false, err: { kind: "config", message: cfgRes.message } };
  }
  const { cfg } = cfgRes;

  const decisionBlocks: string[] = [];
  for (const cat of Array.from(new Set(PAIR_CATEGORIES.flatMap(([, cs]) => cs)))) {
    const rows = decisionsByCategory.get(cat) ?? [];
    if (rows.length === 0) {
      decisionBlocks.push(`- ${cat}: (no active decision yet)`);
      continue;
    }
    for (const d of rows) {
      decisionBlocks.push(
        `- id=${d.id} category=${d.category}\n  title: ${d.title}\n  content:\n${d.content
          .split("\n")
          .map((l) => `    ${l}`)
          .join("\n")}`,
      );
    }
  }

  const methodologyBlock = methodologyReferences?.trim()
    ? `
TRUSTED BRAND-STRATEGY REFERENCES (METHODOLOGY ONLY; NOT STARTUP FACTS OR EVIDENCE):
"""
${methodologyReferences.trim()}
"""
Use these references as quality guidance only. Do not infer startup facts or context ids from them.
`
    : "";

  const userPrompt = `Check all 9 pairs against the following active brand decisions:

${decisionBlocks.join("\n\n")}

${methodologyBlock}
Process ALL 9 pairs exactly once and quote the wording behind every PASS and NEEDS_REVIEW. Return ONLY the JSON object as specified in your instructions.`;

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
      contents: [{ role: "user", parts: [{ text: `${SYSTEM_PROMPT}\n\n${userPrompt}` }] }],
      generationConfig: {
        temperature: 0.15,
        maxOutputTokens: 6000,
        responseMimeType: "application/json",
      },
    };
  } else {
    const base =
      cfg.endpoint ??
      (cfg.provider === "openrouter" ? "https://openrouter.ai/api/v1" : "https://api.openai.com/v1");
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
    /* ignore */
  }
  if (!contentText) {
    return { ok: false, err: { kind: "parse", message: "AI response did not contain message content.", raw: json } };
  }
  const jsonStr = findJson(contentText);
  if (!jsonStr) {
    return {
      ok: false,
      err: { kind: "parse", message: "AI response could not be parsed as consistency JSON.", raw: contentText.slice(0, 1500) },
    };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonStr);
  } catch {
    return { ok: false, err: { kind: "parse", message: "AI response was not valid JSON.", raw: jsonStr.slice(0, 1500) } };
  }
  return validateConsistencyResponse(parsed, decisionsByCategory);
}
