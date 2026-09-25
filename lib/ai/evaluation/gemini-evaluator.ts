import type { Json } from "@/lib/types/database";
import {
  normalizeBrandEvaluationResponse,
  type BrandEvaluationInput,
  type BrandEvaluationVerdict,
  type BrandEvaluator,
} from "@/lib/ai/evaluation/evaluator";

const JSON_START_RE = /^[\s\uFEFF\u200B]*\{/;
const JSON_END_RE = /\}[\s\uFEFF\u200B]*$/;

const SYSTEM_PROMPT = `You are a Brand Decision Evaluator. Evaluate a structured brand decision and return exactly one JSON object:
{
  "verdict": "PASS | NEEDS_REVIEW | REVISE",
  "confidence": 0.00,
  "explanation": "2-4 specific sentences naming the evidence and the decision weakness.",
  "revision_guidance": "One bounded rewrite direction for NEEDS_REVIEW or REVISE, otherwise null."
}

Verdicts:
- PASS: the decision is specific, internally consistent, and supported by the supplied approved evidence.
- NEEDS_REVIEW: the decision is usable but has a small alignment or specificity weakness.
- REVISE: the decision has a material weakness, contradiction, or unsupported claim.

Rules:
- APPROVED EVIDENCE is the only startup evidence. Use it to test factual support.
- METHODOLOGY REFERENCES are trusted brand-strategy guidance only. They are never startup evidence and must never be treated as facts about this startup.
- Do not invent startup facts, context ids, competitors, pricing, traction, or claims.
- Judge the decision that is evaluated, not an ideal decision that is absent.
- REVISE only for a defect you can state concretely from the decision and approved evidence.`;

function findJson(text: string): string | null {
  const trimmed = text.trim();
  if (JSON_START_RE.test(trimmed) && JSON_END_RE.test(trimmed)) return trimmed;
  const first = trimmed.indexOf("{");
  const last = trimmed.lastIndexOf("}");
  if (first === -1 || last === -1 || last <= first) return null;
  return trimmed.slice(first, last + 1);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function userPrompt(input: BrandEvaluationInput): string {
  const decisionLines = [
    `- id=${input.decision.id ?? "unpersisted"} category=${input.decision.category}`,
    `  title: ${input.decision.title}`,
    `  rationale: ${input.decision.rationale ?? "(none)"}`,
    `  supporting_context_ids: [${input.decision.supporting_context_ids.join(", ")}]`,
    `  content:\n${input.decision.content
      .split("\n")
      .map((line) => `    ${line}`)
      .join("\n")}`,
  ].join("\n");
  const relatedLines =
    input.relatedDecisions.length > 0
      ? input.relatedDecisions
          .map(
            (decision) =>
              `- [${decision.category}] ${decision.title}: ${decision.content.replace(/\s+/g, " ").trim()}`,
          )
          .join("\n")
      : "(none)";
  const evidenceLines =
    input.approvedEvidence.length > 0
      ? input.approvedEvidence
          .map(
            (evidence) =>
              `- id=${evidence.id} type=${evidence.type}: ${evidence.content.replace(/\s+/g, " ").trim()}`,
          )
          .join("\n")
      : "(none supplied for this decision)";

  return `Evaluate this brand decision.

SUBJECT:
${input.subject}

DECISION UNDER EVALUATION:
${decisionLines}

RELATED ACTIVE BRAND DECISIONS (for internal consistency only):
${relatedLines}

APPROVED EVIDENCE (the only startup evidence):
${evidenceLines}

METHODOLOGY REFERENCES (trusted guidance, NOT startup facts or evidence):
${input.methodologyReferences || "(none)"}

Return ONLY the JSON object described in your instructions.`;
}

export class GeminiBrandEvaluator implements BrandEvaluator {
  readonly provider = "gemini" as const;

  async evaluate(input: BrandEvaluationInput) {
    const apiKey = process.env.GEMINI_API_KEY?.trim() ?? "";
    if (!apiKey) {
      return {
        ok: false as const,
        error: { provider: "gemini" as const, message: "GEMINI_API_KEY is not configured." },
      };
    }

    const base =
      process.env.GEMINI_BASE_URL?.trim() ||
      "https://generativelanguage.googleapis.com/v1beta";
    const model = process.env.GEMINI_MODEL?.trim() || "gemini-3.5-flash-lite";
    const url = `${base}/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;
    const body: Json = {
      contents: [
        {
          role: "user",
          parts: [{ text: `${SYSTEM_PROMPT}\n\n${userPrompt(input)}` }],
        },
      ],
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: 1600,
        responseMimeType: "application/json",
      },
    };

    let response: Response;
    try {
      response = await fetch(url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-goog-api-client": "living-brand-intelligence-hackathon/1.0",
        },
        body: JSON.stringify(body),
        cache: "no-store",
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Network error.";
      return {
        ok: false as const,
        error: { provider: "gemini" as const, message: `Gemini request failed: ${message}` },
      };
    }

    if (!response.ok) {
      let detail = `HTTP ${response.status}`;
      try {
        const text = await response.text();
        if (text) detail += `: ${text.slice(0, 240)}`;
      } catch {
        detail += "";
      }
      return {
        ok: false as const,
        error: { provider: "gemini" as const, message: `Gemini returned an error. ${detail}` },
      };
    }

    let json: unknown;
    try {
      json = await response.json();
    } catch {
      return {
        ok: false as const,
        error: { provider: "gemini" as const, message: "Gemini did not return JSON." },
      };
    }

    const candidates = isRecord(json) && Array.isArray(json.candidates) ? json.candidates : [];
    const first = candidates[0];
    const parts =
      isRecord(first) && isRecord(first.content) && Array.isArray(first.content.parts)
        ? first.content.parts
        : [];
    const contentText = parts
      .map((part) => (isRecord(part) && typeof part.text === "string" ? part.text : ""))
      .join("")
      .trim();

    if (!contentText) {
      return {
        ok: false as const,
        error: { provider: "gemini" as const, message: "Gemini response did not contain evaluation content." },
      };
    }

    const jsonText = findJson(contentText);
    if (!jsonText) {
      return {
        ok: false as const,
        error: { provider: "gemini" as const, message: "Gemini evaluation was not JSON." },
      };
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(jsonText);
    } catch {
      return {
        ok: false as const,
        error: { provider: "gemini" as const, message: "Gemini evaluation JSON was invalid." },
      };
    }

    const normalized = normalizeBrandEvaluationResponse(parsed);
    if (!normalized) {
      return {
        ok: false as const,
        error: { provider: "gemini" as const, message: "Gemini evaluation was incomplete." },
      };
    }

    return {
      ok: true as const,
      evaluation: {
        subject: input.subject,
        decisionId: input.decision.id ?? null,
        verdict: normalized.verdict as BrandEvaluationVerdict,
        confidence: normalized.confidence,
        explanation: normalized.explanation,
        revisionGuidance: normalized.revisionGuidance,
        provider: "gemini" as const,
        referenceIds: [...input.referenceIds],
      },
    };
  }
}
