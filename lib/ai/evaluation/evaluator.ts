import type { BrandDecisionCategory, ContextItemType } from "@/lib/types/database";
import { GeminiBrandEvaluator } from "@/lib/ai/evaluation/gemini-evaluator";
import { JevBrandEvaluator } from "@/lib/ai/evaluation/jev-evaluator";

export type BrandEvaluationVerdict = "PASS" | "NEEDS_REVIEW" | "REVISE";

export type EvaluatedDecision = {
  id?: string;
  category: BrandDecisionCategory;
  title: string;
  content: string;
  rationale?: string | null;
  supporting_context_ids: readonly string[];
};

export type BrandEvaluationEvidence = {
  id: string;
  type: ContextItemType;
  content: string;
};

export type BrandEvaluationInput = {
  subject: string;
  decision: EvaluatedDecision;
  relatedDecisions: readonly EvaluatedDecision[];
  approvedEvidence: readonly BrandEvaluationEvidence[];
  methodologyReferences: string;
  referenceIds: readonly string[];
};

export type BrandEvaluation = {
  subject: string;
  decisionId: string | null;
  verdict: BrandEvaluationVerdict;
  confidence: number | null;
  explanation: string;
  revisionGuidance: string | null;
  provider: "jev" | "gemini";
  referenceIds: string[];
};

export type BrandEvaluationError = {
  provider: "jev" | "gemini";
  message: string;
};

export interface BrandEvaluator {
  readonly provider: "jev" | "gemini";
  evaluate(
    input: BrandEvaluationInput,
  ): Promise<
    | { ok: true; evaluation: BrandEvaluation }
    | { ok: false; error: BrandEvaluationError }
  >;
}

export type NormalizedEvaluation = {
  verdict: BrandEvaluationVerdict;
  confidence: number | null;
  explanation: string;
  revisionGuidance: string | null;
};

export function normalizeBrandEvaluationResponse(
  raw: unknown,
): NormalizedEvaluation | null {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return null;
  const record = raw as Record<string, unknown>;
  const verdictRaw =
    typeof record.verdict === "string" ? record.verdict.trim().toUpperCase() : "";
  const verdict =
    verdictRaw === "PASS" || verdictRaw === "NEEDS_REVIEW" || verdictRaw === "REVISE"
      ? (verdictRaw as BrandEvaluationVerdict)
      : null;
  const explanation =
    typeof record.explanation === "string" && record.explanation.trim()
      ? record.explanation.trim().slice(0, 2000)
      : null;
  if (!verdict || !explanation) return null;
  const confidence =
    typeof record.confidence === "number" && Number.isFinite(record.confidence)
      ? Math.max(0, Math.min(1, Number(record.confidence.toFixed(2))))
      : null;
  const revisionGuidance =
    typeof record.revision_guidance === "string" && record.revision_guidance.trim()
      ? record.revision_guidance.trim().slice(0, 2000)
      : null;
  return { verdict, confidence, explanation, revisionGuidance };
}

export async function evaluateBrandDecision(
  input: BrandEvaluationInput,
): Promise<
  | { ok: true; evaluation: BrandEvaluation }
  | { ok: false; error: BrandEvaluationError }
> {
  const typesafeKey = process.env.TYPESAFE_API_KEY?.trim() ?? "";
  let fallbackReason = "TYPESAFE_API_KEY is not configured.";

  if (typesafeKey) {
    const jev = new JevBrandEvaluator({
      apiKey: typesafeKey,
      baseUrl:
        process.env.TYPESAFE_SYSTEMONE_URL?.trim() ||
        "https://api.typesafe.ai/v1/systemone",
      model: process.env.JEV_MODEL?.trim() || "jev-latest",
    });
    const jevResult = await jev.evaluate(input);
    if (jevResult.ok) return jevResult;
    fallbackReason = `TypeSafe System One was unavailable: ${jevResult.error.message}`;
  }

  const geminiResult = await new GeminiBrandEvaluator().evaluate(input);
  if (geminiResult.ok) return geminiResult;
  return {
    ok: false,
    error: {
      provider: "gemini",
      message: `${fallbackReason} Gemini evaluator was unavailable: ${geminiResult.error.message}`,
    },
  };
}
