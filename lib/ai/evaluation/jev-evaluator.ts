import type {
  BrandEvaluationInput,
  BrandEvaluationVerdict,
  BrandEvaluator,
} from "@/lib/ai/evaluation/evaluator";

export type JevEvaluatorConfig = {
  apiKey: string;
  baseUrl: string;
  model: string;
};

const VERDICTS: readonly BrandEvaluationVerdict[] = [
  "PASS",
  "NEEDS_REVIEW",
  "REVISE",
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function clampContent(value: string, limit: number): string {
  return value.replace(/\s+/g, " ").trim().slice(0, limit);
}

function verdictFromChoice(choice: string): BrandEvaluationVerdict | null {
  const normalized = choice.trim().toUpperCase().replace(/[\s-]+/g, "_");
  return VERDICTS.find((verdict) => verdict === normalized) ?? null;
}

export class JevBrandEvaluator implements BrandEvaluator {
  readonly provider = "jev" as const;
  private readonly config: JevEvaluatorConfig;

  constructor(config: JevEvaluatorConfig) {
    this.config = config;
  }

  async evaluate(input: BrandEvaluationInput) {
    const state = {
      subject: input.subject,
      decision: {
        id: input.decision.id ?? null,
        category: input.decision.category,
        title: clampContent(input.decision.title, 200),
        content: clampContent(input.decision.content, 6000),
        rationale: input.decision.rationale
          ? clampContent(input.decision.rationale, 2000)
          : null,
        supporting_context_ids: [...input.decision.supporting_context_ids],
      },
      related_decisions: input.relatedDecisions.map((decision) => ({
        category: decision.category,
        title: clampContent(decision.title, 200),
        content: clampContent(decision.content, 2500),
      })),
      approved_evidence: input.approvedEvidence.map((evidence) => ({
        id: evidence.id,
        type: evidence.type,
        content: clampContent(evidence.content, 1200),
      })),
      methodology_references: clampContent(input.methodologyReferences, 5000),
    };

    let response: Response;
    try {
      response = await fetch(this.config.baseUrl, {
        method: "POST",
        headers: {
          authorization: `Bearer ${this.config.apiKey}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: this.config.model,
          state,
          questions: {
            verdict: {
              type: "choice",
              instructions:
                "Evaluate the structured brand decision against its related decisions and approved evidence. Choose PASS when it is specific, consistent, and supported. Choose NEEDS_REVIEW for a small alignment or specificity weakness. Choose REVISE for a material contradiction or unsupported claim. Approved evidence is the only startup evidence. Methodology references are guidance, never startup evidence.",
              criteria: {
                PASS: "The decision is specific, internally consistent, and supported by the supplied approved evidence.",
                NEEDS_REVIEW: "The decision is usable but has a small alignment or specificity weakness.",
                REVISE: "The decision has a material weakness, contradiction, or unsupported claim.",
              },
            },
          },
        }),
        cache: "no-store",
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Network error.";
      return {
        ok: false as const,
        error: { provider: "jev" as const, message: `TypeSafe System One request failed: ${message}` },
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
        error: {
          provider: "jev" as const,
          message: `TypeSafe System One returned an error. ${detail}`,
        },
      };
    }

    let json: unknown;
    try {
      json = await response.json();
    } catch {
      return {
        ok: false as const,
        error: {
          provider: "jev" as const,
          message: "TypeSafe System One did not return JSON.",
        },
      };
    }

    const answers = isRecord(json) && isRecord(json.answers) ? json.answers : null;
    const answer = answers && isRecord(answers.verdict) ? answers.verdict : null;
    if (!answer || answer.type !== "choice" || typeof answer.choice !== "string") {
      return {
        ok: false as const,
        error: {
          provider: "jev" as const,
          message: "TypeSafe System One did not return a typed verdict.",
        },
      };
    }

    const verdict = verdictFromChoice(answer.choice);
    if (!verdict) {
      return {
        ok: false as const,
        error: {
          provider: "jev" as const,
          message: `TypeSafe System One returned an unknown verdict: ${answer.choice}.`,
        },
      };
    }

    const rawConfidence = answer.confidence;
    const confidence =
      typeof rawConfidence === "number" && Number.isFinite(rawConfidence)
        ? Math.max(0, Math.min(1, Number(rawConfidence.toFixed(2))))
        : null;
    const confidenceLabel =
      confidence === null ? "unspecified" : `${Math.round(confidence * 100)}% confidence`;
    const explanation = `TypeSafe System One evaluated the structured decision state and selected ${verdict} (${confidenceLabel}).`;

    return {
      ok: true as const,
      evaluation: {
        subject: input.subject,
        decisionId: input.decision.id ?? null,
        verdict,
        confidence,
        explanation,
        revisionGuidance:
          verdict === "REVISE"
            ? "Re-evaluate the smallest decision that violates the evaluator's selected direction against approved evidence before proposing a bounded revision."
            : verdict === "NEEDS_REVIEW"
            ? "Clarify or align the weakest part of this decision without changing its strategic intent."
            : null,
        provider: "jev" as const,
        referenceIds: [...input.referenceIds],
      },
    };
  }
}
