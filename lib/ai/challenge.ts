import type { BrandDecisionCategory, Json } from "@/lib/types/database";
import {
  resolveAiConfig,
  type DiscoveryError,
} from "@/lib/ai/discovery";

export type ChallengeIssue = {
  id: string;
  severity: "high" | "medium" | "low";
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

type CriticResultRaw = {
  issues?: unknown[];
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

const CLICHES = `Banned generic startup clichés to detect and flag:
- "innovative platform", "seamless experience", "empower users", "user-centric", "leverage AI",
- "next-generation", "revolutionary", "disruptive", "game-changing", "cutting-edge",
- "end-to-end solution", "one-stop shop", "holistic approach", "drive growth",
- "unlock potential", "streamline workflows", "actionable insights", "robust",
- "scalable", "world-class", "best-in-class", "mission-critical"`;

const DETECTORS = `8 detectors to apply:
1. CLICHÉS / GENERIC LANGUAGE: contains any phrase from the banned clichés list, or language that applies equally well to thousands of unrelated startups (e.g., describing software as "user-friendly" with no specifics).
2. WEAK DIFFERENTIATION: position/differentiation decision could describe literally any category participant — reader cannot tell the startup apart from alternatives.
3. UNSUPPORTED CLAIMS: decision states facts or numbers or market conclusions not supported by any supporting_context_ids, or cited context items are all HYPOTHESIS with no FACT backing.
4. AUDIENCE MISMATCH: PERSONALITY / VOICE / MESSAGING decision's tone, vocabulary, references or implied-values directly contradict the AUDIENCE decision's documented who-they-are / what-they-care-about.
5. CONTRADICTIONS: two active decisions directly conflict on the same dimension (e.g., NAMING playful but VOICE says "formal and never casual").
6. BIAS / EXCLUSION: language that ungroundedly assumes a demographic, gender, geography, ability, culture, or socio-economic status; excludes reasonable user segments without justification; coded dog-whistles.
7. WEAK NAMING: names / territories are generic dictionary words in an overcrowded space, hard to pronounce, hard to spell, easily confused with existing major brands, zero rationale linking name to the actual startup idea.
8. VAGUE POSITIONING: POSITIONING uses empty nouns like "the X for Y" without specifying a category or who the alternatives are; no anchor; could mean anything to anyone.`;

const SYSTEM_PROMPT = `You are the Brand Critic — a senior brand editor who finds weak spots before launch.

Your job: audit every active brand decision using the 8 detectors below. For each real defect you find, return a structured issue with severity, evidence, and a concrete rewritten alternative. Be strict but fair — only report defects you can defend with evidence; do not nitpick style.

${CLICHES}

${DETECTORS}

You must return ONLY a single valid JSON object:
{
  "issues": [
    {
      "id": "crit_nnnn1",
      "severity": "high | medium | low",
      "affected_decision_id": "EXACT id from the provided active decisions list",
      "affected_category": "ONE of the 11 categories",
      "issue_title": "Short title, 6-12 words",
      "issue": "The actual defect. 2-4 sentences, specific and precise. Name which detector triggered.",
      "evidence": "Quote from the decision content + explain exactly why it's a problem. Ground in supporting context if relevant.",
      "proposed_alternative": "A concrete REWRITTEN alternative for the affected DECISION CONTENT (not just advice). Use the same ### section structure if the category expects it. Keep length comparable to the original."
    }
  ]
}

Rules:
- If there are zero genuine defects, return {"issues": []} (empty array is correct and encouraged).
- Each issue MUST reference an affected_decision_id that exactly matches one id from the provided active decisions list. Never invent decision ids.
- affected_category MUST be one of the 11 allowed categories.
- severity = high for: contradictions, unsupported claims that are central to positioning, exclusion/bias, genuinely overcrowded trademark-risk naming.
- severity = medium for: clichés, weak differentiation, vague positioning, clear audience mismatch on tone.
- severity = low for: minor word choice polish, small naming readability nits that don't confuse.
- proposed_alternative: always a full replacement text for the decision.content field of the affected decision, not just advice. Preserve structured ### sections for categories that have them.
- NEVER recommend changing decisions to use the banned clichés themselves.
- Do not add commentary beyond the JSON object. Do not wrap JSON in markdown.`;

function normalizeSeverity(raw: unknown): ChallengeIssue["severity"] | null {
  if (typeof raw !== "string") return null;
  const s = raw.trim().toLowerCase();
  if (s === "high" || s === "medium" || s === "low") return s;
  return null;
}

function normalizeCategory(raw: unknown): BrandDecisionCategory | null {
  if (typeof raw !== "string") return null;
  const up = raw.trim().toUpperCase();
  return (CATEGORIES as readonly string[]).includes(up)
    ? (up as BrandDecisionCategory)
    : null;
}

export function validateCriticResponse(
  raw: unknown,
  validDecisionIds: Set<string>,
): { ok: true; result: { issues: ChallengeIssue[] } } | { ok: false; err: DiscoveryError } {
  if (!isRecord(raw)) {
    return { ok: false, err: { kind: "parse", message: "Critic response is not a JSON object.", raw } };
  }
  const dto = raw as CriticResultRaw;
  const issuesArr = Array.isArray(dto.issues) ? dto.issues : [];
  const issues: ChallengeIssue[] = [];
  const seenIds = new Set<string>();
  for (const row of issuesArr) {
    if (!isRecord(row)) continue;
    const severity = normalizeSeverity(row.severity);
    const decisionId =
      typeof row.affected_decision_id === "string" ? row.affected_decision_id.trim() : "";
    const category = normalizeCategory(row.affected_category);
    if (!severity || !decisionId || !validDecisionIds.has(decisionId) || !category) continue;
    const idRaw =
      typeof row.id === "string" && row.id.trim().length > 0
        ? row.id.trim().slice(0, 80)
        : `crit_${Math.random().toString(36).slice(2, 9)}`;
    const id = seenIds.has(idRaw) ? `${idRaw}_${Math.random().toString(36).slice(2, 6)}` : idRaw;
    seenIds.add(id);
    const issue_title = typeof row.issue_title === "string" ? row.issue_title.trim().slice(0, 160) : "Issue";
    const issue = typeof row.issue === "string" ? row.issue.trim().slice(0, 2500) : "";
    const evidence = typeof row.evidence === "string" ? row.evidence.trim().slice(0, 2500) : "";
    const proposed_alternative =
      typeof row.proposed_alternative === "string" ? row.proposed_alternative.trim().slice(0, 5000) : "";
    if (!issue || !evidence || !proposed_alternative) continue;
    issues.push({
      id,
      severity,
      affected_decision_id: decisionId,
      affected_category: category,
      issue_title,
      issue,
      evidence,
      proposed_alternative,
    });
    if (issues.length > 60) break;
  }
  return { ok: true, result: { issues } };
}

export async function runBrandCritic(
  activeDecisions: readonly CriticDecisionInput[],
  approvedContext: readonly CriticContextInput[],
  methodologyReferences?: string,
): Promise<{ ok: true; result: { issues: ChallengeIssue[] } } | { ok: false; err: DiscoveryError }> {
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
  const validIds = new Set(activeDecisions.map((d) => d.id));
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

  const userPrompt = `Critique the following active brand decisions.

ACTIVE BRAND DECISIONS (these are the only allowed values for affected_decision_id):
${decisionLines.join("\n\n")}

APPROVED STARTUP CONTEXT (for grounding evidence / detector 3 / detector 4 checks):
${ctxLines.length > 0 ? ctxLines.join("\n") : "(none)"}

${methodologyBlock}
Banned clichés list and 8 detectors are in your instructions. Only report real, defensible defects. If nothing is wrong, return {"issues": []}. Return ONLY the JSON object.`;

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
      contents: [
        {
          role: "user",
          parts: [{ text: `${SYSTEM_PROMPT}\n\n${userPrompt}` }],
        },
      ],
      generationConfig: {
        temperature: 0.15,
        maxOutputTokens: 4000,
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
  return validateCriticResponse(parsed, validIds);
}
