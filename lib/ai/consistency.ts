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

export type ConsistencyPairResult = {
  pair: string;
  result: "PASS" | "NEEDS REVIEW" | "CONFLICT";
  explanation: string;
  suggested_fix: string | null;
};

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

Your job: for each of the 9 listed decision pairs below, return exactly 1 result with:
- "pair": the exact pair label from the list (verbatim)
- "result": "PASS" | "NEEDS REVIEW" | "CONFLICT"
- "explanation": 2-3 sentences explaining the call. Be specific; cite quotes if relevant.
- "suggested_fix": a proposed fix or null for PASS. For CONFLICT, suggest one concrete rewritten direction. For NEEDS REVIEW, suggest a small alignment edit. For PASS, null.

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
- PASS: the two (or three) decisions align well — wording, implied values, target audience, tone all agree.
- NEEDS REVIEW: not broken but slightly misaligned — small wording tweak would help. No direct contradiction.
- CONFLICT: direct contradiction. Decisions explicitly point in opposite directions. Example: Personality says "irreverent, casual, sarcastic" but Launch copy reads "formal enterprise press release".

Rules:
- You MUST return exactly 9 entries in pair_results — one for EACH of the 9 pairs listed above. Order does not matter but every pair label must appear verbatim.
- If one or both sides of a pair are MISSING from the provided active decisions, return PASS with explanation: "Pair: one side has no active decision yet. Nothing to conflict." and suggested_fix=null.
- Do not invent new pairs. Do not skip pairs.
- suggested_fix for CONFLICT should propose rewritten content for one of the decisions (short paragraph). suggested_fix for NEEDS REVIEW should be a small edit direction.
- Return ONLY one JSON object:
{
  "pair_results": [
    {"pair": "Audience ↔ Positioning", "result": "PASS", "explanation": "...", "suggested_fix": null},
    ... 8 more ...
  ]
}`;

function normalizeResult(raw: unknown): ConsistencyPairResult["result"] | null {
  if (typeof raw !== "string") return null;
  const t = raw.trim().toUpperCase();
  if (t === "PASS" || t === "NEEDS REVIEW" || t === "CONFLICT") return t;
  return null;
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
    const result = normalizeResult(row.result);
    if (!PAIRS.includes(pair) || !result) continue;
    const explanation = typeof row.explanation === "string" ? row.explanation.trim().slice(0, 2000) : "";
    if (!explanation) continue;
    const fixRaw = row.suggested_fix;
    const suggested_fix =
      typeof fixRaw === "string" && fixRaw.trim().length > 0 ? fixRaw.trim().slice(0, 3000) : null;
    if (byPair.has(pair)) continue;
    byPair.set(pair, { pair, result, explanation, suggested_fix });
  }
  // Fill missing pairs: synthesize PASS if AI missed one
  for (const [pair, cats] of PAIR_CATEGORIES) {
    if (!byPair.has(pair)) {
      const anyMissing = cats.some((c) => (decisionsByCategory.get(c)?.length ?? 0) === 0);
      byPair.set(pair, {
        pair,
        result: "PASS",
        explanation: anyMissing
          ? "Pair: one side has no active decision yet. Nothing to conflict."
          : "Consensus alignment — no inconsistency detected.",
        suggested_fix: null,
      });
    }
  }
  const pair_results = PAIRS.map((p) => byPair.get(p)!).filter(Boolean);
  return { ok: true, result: { pair_results } };
}

export async function runConsistencyGuardian(
  decisionsByCategory: Map<BrandDecisionCategory, BrandDecision[]>,
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

  const userPrompt = `Check all 9 pairs against the following active brand decisions:

${decisionBlocks.join("\n\n")}

Process ALL 9 pairs exactly once. Return ONLY the JSON object as specified in your instructions.`;

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
      max_tokens: 4000,
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
        maxOutputTokens: 4000,
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
