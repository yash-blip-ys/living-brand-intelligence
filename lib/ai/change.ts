import type { BrandDecisionCategory, Json } from "@/lib/types/database";
import type { ImpactSeverity } from "@/lib/types/database";
import {
  resolveAiConfig,
  type DiscoveryError,
} from "@/lib/ai/discovery";

export type ChangeContextInput = {
  id: string;
  type: string;
  content: string;
  confidence: number | null;
  source: string | null;
};

export type ChangeDecisionInput = {
  id: string;
  category: BrandDecisionCategory;
  title: string;
  content: string;
  rationale: string | null;
  supporting_context_ids: string[];
};

export type ProposedImpact = {
  brand_decision_id: string;
  impact_type: string;
  severity: ImpactSeverity;
  reason: string;
  needs_review: boolean;
  proposed_title: string;
  proposed_content: string;
  proposed_rationale: string;
};

export type ChangeAnalysisAiResult = {
  summary: string;
  impacts: ProposedImpact[];
};

type ImpactDto = unknown;

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

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

function normalizeSeverity(raw: unknown): ImpactSeverity | null {
  if (typeof raw !== "string") return null;
  const low = raw.trim().toLowerCase();
  if (low === "low" || low === "medium" || low === "high")
    return low as ImpactSeverity;
  return null;
}

function validateImpacts(
  raw: unknown,
  validDecisionIds: Set<string>,
  decisionsById: Map<string, ChangeDecisionInput>,
): ProposedImpact[] {
  if (!Array.isArray(raw)) return [];
  const out: ProposedImpact[] = [];
  const seen = new Set<string>();
  for (const row of raw as ImpactDto[]) {
    if (!isRecord(row)) continue;
    const decisionId =
      typeof row.brand_decision_id === "string"
        ? row.brand_decision_id.trim()
        : "";
    if (!decisionId || !validDecisionIds.has(decisionId)) continue;
    const impactType =
      typeof row.impact_type === "string" ? row.impact_type.trim() : "review";
    const severity = normalizeSeverity(row.severity) ?? "medium";
    const reason =
      typeof row.reason === "string"
        ? row.reason.trim().slice(0, 1500)
        : "";
    if (!reason) continue;
    const needs_review =
      typeof row.needs_review === "boolean" ? row.needs_review : true;
    const key = decisionId;
    if (seen.has(key)) continue;
    seen.add(key);

    const current = decisionsById.get(decisionId);

    let proposed_title =
      typeof row.proposed_title === "string"
        ? row.proposed_title.trim().slice(0, 200)
        : "";
    let proposed_content =
      typeof row.proposed_content === "string"
        ? row.proposed_content.trim().slice(0, 2000)
        : "";
    let proposed_rationale =
      typeof row.proposed_rationale === "string"
        ? row.proposed_rationale.trim().slice(0, 2000)
        : "";

    if (!proposed_title || !proposed_content || !proposed_rationale) {
      if (!needs_review) {
        proposed_title = current?.title ?? "No change proposed";
        proposed_content = current?.content ?? "";
        proposed_rationale =
          current?.rationale ??
          "Impact considered minor; no change recommended.";
      } else {
        proposed_title = current?.title
          ? `${current.title} (revised)`
          : "Proposed revision";
        proposed_content = current?.content ?? reason;
        proposed_rationale =
          (current?.rationale ? `${current.rationale}\n\n` : "") +
          `Revised because: ${reason}`;
      }
    }

    out.push({
      brand_decision_id: decisionId,
      impact_type: impactType || "review",
      severity,
      reason,
      needs_review,
      proposed_title,
      proposed_content,
      proposed_rationale,
    });
  }
  return out;
}

export function validateChangeAnalysisResponse(
  raw: unknown,
  validDecisionIds: Set<string>,
  decisionsById: Map<string, ChangeDecisionInput>,
):
  | { ok: true; result: ChangeAnalysisAiResult }
  | { ok: false; err: DiscoveryError } {
  if (!isRecord(raw)) {
    return {
      ok: false,
      err: {
        kind: "parse",
        message: "Change analysis response was not a JSON object.",
        raw,
      },
    };
  }
  const summary =
    typeof raw.summary === "string" ? raw.summary.trim().slice(0, 500) : "";
  const impacts = validateImpacts(raw.impacts, validDecisionIds, decisionsById);
  if (!summary || impacts.length === 0) {
    return {
      ok: false,
      err: {
        kind: "parse",
        message:
          "The model returned a change analysis without decision impacts or a summary. Try again.",
        raw,
      },
    };
  }
  return { ok: true, result: { summary, impacts } };
}

const SYSTEM_PROMPT = `You are a Brand Evolution Analyst for an early-stage startup's living brand intelligence system.

Your job: given NEW FACT information from the founder and the existing approved context + active brand decisions, identify which active brand decisions may be affected AND propose a concise revised decision text for each — only changing what the new evidence actually requires.

You MUST return ONLY a valid JSON object matching this schema exactly:
{
  "summary": "One concise sentence describing the overall strategic drift or shift caused by the new information.",
  "impacts": [
    {
      "brand_decision_id": "id drawn exactly from the active decision ids given",
      "impact_type": "contradiction | scope_expansion | scope_shift | new_stakeholder | tone_shift | repositioning | other",
      "severity": "low | medium | high",
      "reason": "Why this decision is affected. Reference exact text from the new context and the decision content. Be specific and anti-generic.",
      "needs_review": true,
      "proposed_title": "Short title for the REVISED decision. Keep unaffected strategic meaning; only change what the new evidence requires.",
      "proposed_content": "The full REVISED decision text. Preserve the unaffected parts of the current decision; surgically modify only what the new evidence demands. Do NOT simply paraphrase; do NOT rewrite for the sake of rewriting.",
      "proposed_rationale": "Why this revision. Name the new FACT, explain what changed, and cite any supporting context or sibling decisions that informed this change."
    }
  ]
}

Rules:
1. You MUST NOT directly modify any active brand decision in the database. You only propose revised wording for the founder to review and explicitly approve.
2. Only include impacts for decisions whose ids appear in the active decisions list provided. No invented ids.
3. Do not invent impacts for decisions that are clearly unaffected. Fewer, honest impacts are better.
4. "severity":
   - high — new fact directly contradicts or fundamentally re-scopes the decision.
   - medium — decision may still hold but its rationale or scope is meaningfully changed.
   - low — minor drift; worth noting but still valid.
5. "needs_review": true if the founder should explicitly approve or reject the revision; false only if you are confident the decision is still completely valid and you propose no change (still provide proposed_title/proposed_content/proposed_rationale equal to the current ones in that case).
6. "proposed_title / proposed_content / proposed_rationale" are required for every impact.
   - If needs_review is true: proposed_content MUST be materially different from the current decision in exactly the places the new evidence requires AND MUST preserve the unaffected strategic meaning.
   - If needs_review is false: proposed_content MUST equal the current decision text.
   - NEVER just paraphrase. If the decision should still read the same, return it verbatim and set needs_review=false.
7. "impact_type": pick the closest fit from the enum; "other" only if nothing else matches.
8. "reason" and "proposed_rationale" MUST name specific text from (a) the triggering new FACT, (b) the current decision, and optionally (c) supporting context / sibling active decisions where the revision keeps consistency.
9. Revision style: surgical. Example: if Audience was "College students participating in hackathons." and the new fact says "Professional developers are also joining the platform." then propose something like "Hackathon participants seeking compatible teammates, initially focused on college students while expanding to professional developers." — do not invent a new strategy unrelated to the existing text.
10. Do NOT propose unrelated new brand decisions elsewhere. Only revise the impacted decisions listed.
11. Be conservative. If you are not confident a decision is affected, omit it.
12. Respond with ONLY the JSON object.`;

export async function runChangeAnalyst(
  newContext: ChangeContextInput,
  existingApproved: readonly ChangeContextInput[],
  activeDecisions: readonly ChangeDecisionInput[],
): Promise<
  | { ok: true; result: ChangeAnalysisAiResult }
  | { ok: false; err: DiscoveryError }
> {
  if (activeDecisions.length === 0) {
    return {
      ok: false,
      err: {
        kind: "model",
        message:
          "No active brand decisions yet. Create and approve brand strategy first, then run change analysis when the strategy is affected.",
      },
    };
  }

  const cfgRes = resolveAiConfig();
  if (!cfgRes.ok) {
    return {
      ok: false,
      err: { kind: "config", message: cfgRes.message },
    };
  }

  const { cfg } = cfgRes;
  const decisionIds = new Set(activeDecisions.map((d) => d.id));
  const decisionsById = new Map<string, ChangeDecisionInput>();
  for (const d of activeDecisions) decisionsById.set(d.id, d);

  const newCtxText = `type=${newContext.type} id=${newContext.id} source=${
    newContext.source ?? "founder"
  }\n"${newContext.content.replace(/\s+/g, " ").trim()}"`;

  const approvedLines: string[] = [];
  for (const c of existingApproved) {
    if (c.id === newContext.id) continue;
    const conf =
      typeof c.confidence === "number"
        ? ` [confidence ${(c.confidence * 100).toFixed(0)}%]`
        : "";
    approvedLines.push(
      `- id=${c.id} type=${c.type}${conf} source=${
        c.source ?? "discovery"
      }\n  "${c.content.replace(/\s+/g, " ").trim()}"`,
    );
  }

  const decisionLines: string[] = [];
  for (const d of activeDecisions) {
    const support = d.supporting_context_ids.join(", ");
    decisionLines.push(
      `- id=${d.id} category=${d.category}\n  title: ${d.title}\n  decision: ${d.content.replace(
        /\s+/g,
        " ",
      ).trim()}\n  rationale: ${
        (d.rationale ?? "").replace(/\s+/g, " ").trim() || "(none)"
      }\n  supported_by_ids: [${support}]`,
    );
  }

  const userPrompt = `Analyze how this NEW FOUNDER FACT affects the current active brand decisions. Propose a REVISED decision for each impacted decision — only changing what the new evidence requires.

=== NEW CONTEXT (recently added by founder) ===
${newCtxText}

=== EXISTING APPROVED CONTEXT (excluding the new one above) ===
${approvedLines.length > 0 ? approvedLines.join("\n") : "(none other)"}

=== CURRENT ACTIVE BRAND DECISIONS ===
${decisionLines.join("\n")}

=== INSTRUCTIONS ===
Return ONLY the JSON object described in your system instructions. Impact ids must be drawn from the active decision ids above. For every impact requiring review, fill proposed_title, proposed_content, proposed_rationale with a surgical revision that preserves unaffected strategic meaning.`;

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
      max_tokens: 3600,
      system: SYSTEM_PROMPT,
      messages: [
        { role: "user", content: [{ type: "text", text: userPrompt }] },
      ],
    };
  } else if (cfg.provider === "gemini") {
    const base =
      cfg.endpoint ?? "https://generativelanguage.googleapis.com/v1beta";
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
        temperature: 0.1,
        maxOutputTokens: 3600,
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
      temperature: 0.1,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userPrompt },
      ],
    };
  }

  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      cache: "no-store",
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Network error contacting AI provider.";
    return {
      ok: false,
      err: { kind: "model", message: `Unable to reach AI provider: ${message}` },
    };
  }

  if (!response.ok) {
    let detail = `HTTP ${response.status}`;
    try {
      const txt = await response.text();
      if (txt) detail += `: ${txt.slice(0, 240)}`;
    } catch {
      /* ignore */
    }
    return {
      ok: false,
      err: { kind: "model", message: `AI provider returned an error. ${detail}` },
    };
  }

  let json: unknown;
  try {
    json = await response.json();
  } catch (err) {
    const rawText = err instanceof Error ? err.message : "non-JSON response";
    return {
      ok: false,
      err: {
        kind: "parse",
        message: "AI provider did not return JSON.",
        raw: rawText,
      },
    };
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
            for (const p of parts) {
              if (isRecord(p)) {
                const t = (p as Record<string, unknown>).text;
                if (typeof t === "string") texts.push(t);
              }
            }
            if (texts.length > 0) contentText = texts.join("");
          }
        }
      }
      if (!contentText && bodyAny.errorMessage) {
        const msg =
          typeof bodyAny.errorMessage === "string"
            ? bodyAny.errorMessage
            : "";
        return {
          ok: false,
          err: {
            kind: "model",
            message: `Gemini returned an error: ${msg || "unknown"}`,
            raw: json,
          },
        };
      }
    } else {
      const bodyAny = json as Record<string, unknown>;
      const choices = bodyAny.choices;
      if (
        Array.isArray(choices) &&
        choices.length > 0 &&
        isRecord(choices[0]) &&
        isRecord(choices[0].message) &&
        typeof (choices[0].message as Record<string, unknown>).content ===
          "string"
      ) {
        contentText = (choices[0].message as Record<string, unknown>)
          .content as string;
      }
    }
  } catch {
    /* contentText stays empty */
  }

  if (!contentText) {
    return {
      ok: false,
      err: {
        kind: "parse",
        message: "AI response did not contain message content.",
        raw: json,
      },
    };
  }

  const jsonStr = findJson(contentText);
  if (!jsonStr) {
    return {
      ok: false,
      err: {
        kind: "parse",
        message:
          "AI response could not be parsed as structured change-analysis JSON.",
        raw: contentText.slice(0, 1500),
      },
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonStr);
  } catch {
    return {
      ok: false,
      err: {
        kind: "parse",
        message: "AI response was not valid JSON.",
        raw: jsonStr.slice(0, 1500),
      },
    };
  }

  return validateChangeAnalysisResponse(parsed, decisionIds, decisionsById);
}
