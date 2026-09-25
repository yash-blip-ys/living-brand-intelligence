import { RunnableLambda, type RunnableConfig } from "@langchain/core/runnables";
import { LangChainTracer } from "@langchain/core/tracers/tracer_langchain";
import {
  PAIR_CATEGORIES,
  runConsistencyGuardian,
  type ConsistencyPairResult,
} from "@/lib/ai/consistency";
import { runBrandCritic, type ChallengeIssue, type CriticContextInput, type CriticDecisionInput } from "@/lib/ai/challenge";
import type { BrandCheck } from "@/lib/ai/brand-checks";
import { runStrategyAnalyst, type StrategyContextInput, type StrategyResult } from "@/lib/ai/strategy";
import { retrieveBrandReferences } from "@/lib/ai/references/retrieval";
import {
  evaluateBrandDecision,
  type BrandEvaluation,
  type BrandEvaluationEvidence,
  type BrandEvaluationInput,
  type EvaluatedDecision,
} from "@/lib/ai/evaluation/evaluator";
import type { BrandDecision, BrandDecisionCategory } from "@/lib/types/database";

export type StrategyOrchestrationInput = {
  roughIdea: string;
  approvedContext: readonly StrategyContextInput[];
  existingActive: ReadonlyArray<{
    category: BrandDecisionCategory;
    title: string;
    content: string;
  }>;
  strategicGuidance?: string;
  founderGuidance?: string;
  workflow?: "strategy" | "revision";
  categories?: readonly BrandDecisionCategory[];
};

export type DecisionEvaluationPipelineInput = {
  decisions: readonly BrandDecision[];
  evidenceByDecisionId: Readonly<Record<string, readonly BrandEvaluationEvidence[]>>;
  approvedContext: readonly CriticContextInput[];
  supportingIdsByDecisionId: Readonly<Record<string, readonly string[]>>;
};

export type CritiquePipelineResult =
  | {
      ok: true;
      result: {
        checks: BrandCheck[];
        issues: ChallengeIssue[];
        evaluations: BrandEvaluation[];
        evaluationError: string | null;
        referenceIds: string[];
      };
    }
  | { ok: false; err: { kind: "config" | "model" | "parse"; message: string; raw?: unknown } };

export type ConsistencyPipelineResult =
  | {
      ok: true;
      result: {
        pair_results: ConsistencyPairResult[];
        evaluations: BrandEvaluation[];
        evaluationError: string | null;
        referenceIds: string[];
      };
    }
  | { ok: false; err: { kind: "config" | "model" | "parse"; message: string; raw?: unknown } };

type Grounded<T> = T & {
  grounding: { referenceIds: string[]; content: string };
};

type EvaluationState = {
  evaluations: BrandEvaluation[];
  evaluationError: string | null;
  referenceIds: string[];
};

function tracingConfig(runName: string): Partial<RunnableConfig> {
  const config: Partial<RunnableConfig> = {
    runName,
    tags: ["living-brand-intelligence"],
    metadata: { workflow: runName },
  };
  const key = process.env.LANGSMITH_API_KEY?.trim() ?? "";
  const enabled = (process.env.LANGSMITH_TRACING ?? "true").toLowerCase() === "true";
  if (key && enabled) {
    config.callbacks = [
      new LangChainTracer({
        projectName: process.env.LANGSMITH_PROJECT?.trim() || "living-brand-intelligence",
      }),
    ];
  }
  return config;
}

function decisionInput(decision: BrandDecision, supportingIds: readonly string[]): EvaluatedDecision {
  return {
    id: decision.id,
    category: decision.category,
    title: decision.title,
    content: decision.content,
    rationale: decision.rationale,
    supporting_context_ids: supportingIds,
  };
}

function evidenceFor(
  decisionId: string,
  input: DecisionEvaluationPipelineInput,
): readonly BrandEvaluationEvidence[] {
  return input.evidenceByDecisionId[decisionId] ?? [];
}

async function evaluateDecision(
  input: BrandEvaluationInput,
): Promise<{ evaluation: BrandEvaluation | null; error: string | null }> {
  const result = await evaluateBrandDecision(input);
  if (result.ok) return { evaluation: result.evaluation, error: null };
  return { evaluation: null, error: result.error.message };
}

function appendEvaluation(
  state: EvaluationState,
  next: { evaluation: BrandEvaluation | null; error: string | null },
): EvaluationState {
  if (next.evaluation) state.evaluations.push(next.evaluation);
  if (next.error && !state.evaluationError) state.evaluationError = next.error;
  return state;
}

const strategyRetrieval = RunnableLambda.from(
  async (input: StrategyOrchestrationInput): Promise<Grounded<StrategyOrchestrationInput>> => ({
    ...input,
    grounding: await retrieveBrandReferences({
      workflow: input.workflow ?? "strategy",
      categories: input.categories,
      query: input.roughIdea,
      limit: input.workflow === "revision" ? 2 : 3,
    }),
  }),
);

const strategyGeneration = RunnableLambda.from(
  async (input: Grounded<StrategyOrchestrationInput>) =>
    runStrategyAnalyst(
      input.roughIdea,
      input.approvedContext,
      input.existingActive,
      input.strategicGuidance,
      input.grounding.content,
      input.founderGuidance,
    ),
);

const strategyChain = strategyRetrieval.pipe(strategyGeneration);

export async function orchestrateStrategyGeneration(
  input: StrategyOrchestrationInput,
): Promise<{ ok: true; result: StrategyResult } | { ok: false; err: { kind: "config" | "model" | "parse"; message: string; raw?: unknown } }> {
  return strategyChain.invoke(input, tracingConfig("brand:strategy-generation"));
}

const critiqueRetrieval = RunnableLambda.from(
  async (
    input: DecisionEvaluationPipelineInput & { workflow: "critique" | "consistency" },
  ): Promise<Grounded<DecisionEvaluationPipelineInput & { workflow: "critique" | "consistency" }>> => ({
    ...input,
    grounding: await retrieveBrandReferences({
      workflow: input.workflow,
      categories: input.decisions.map((decision) => decision.category),
      query: input.decisions.map((decision) => `${decision.title} ${decision.content}`).join(" "),
      limit: 2,
    }),
  }),
);

const criticRun = RunnableLambda.from(
  async (input: Grounded<DecisionEvaluationPipelineInput & { workflow: "critique" }>) => {
    const criticInputs: CriticDecisionInput[] = input.decisions.map((decision) => ({
      id: decision.id,
      category: decision.category,
      title: decision.title,
      content: decision.content,
      rationale: decision.rationale,
      supporting_context_ids: [...(input.supportingIdsByDecisionId[decision.id] ?? [])],
    }));
    const critic = await runBrandCritic(criticInputs, input.approvedContext, input.grounding.content);
    if (!critic.ok) return { ok: false as const, err: critic.err, decisions: input };
    const state: EvaluationState = {
      evaluations: [],
      evaluationError: null,
      referenceIds: input.grounding.referenceIds,
    };
    const decisionById = new Map(input.decisions.map((decision) => [decision.id, decision]));
    const evaluated = new Set<string>();
    for (const issue of critic.result.issues.slice(0, 6)) {
      if (evaluated.has(issue.affected_decision_id)) continue;
      evaluated.add(issue.affected_decision_id);
      const decision = decisionById.get(issue.affected_decision_id);
      if (!decision) continue;
      const target = decisionInput(decision, input.supportingIdsByDecisionId[decision.id] ?? []);
      const related = input.decisions
        .filter((candidate) => candidate.id !== decision.id)
        .slice(0, 6)
        .map((candidate) => decisionInput(candidate, input.supportingIdsByDecisionId[candidate.id] ?? []));
      appendEvaluation(
        state,
        await evaluateDecision({
          subject: issue.id,
          decision: target,
          relatedDecisions: related,
          approvedEvidence: evidenceFor(decision.id, input),
          methodologyReferences: input.grounding.content,
          referenceIds: input.grounding.referenceIds,
        }),
      );
    }
    return {
      ok: true as const,
      result: { checks: critic.result.checks, issues: critic.result.issues, ...state },
      decisions: input,
    };
  },
);

const critiqueChain = critiqueRetrieval.pipe(criticRun);

export async function orchestrateCritique(
  input: DecisionEvaluationPipelineInput,
): Promise<CritiquePipelineResult> {
  const result = await critiqueChain.invoke(
    { ...input, workflow: "critique" as const },
    tracingConfig("brand:critic-evaluator"),
  );
  if (!result.ok) return result;
  return { ok: true, result: result.result };
}

const consistencyRun = RunnableLambda.from(
  async (input: Grounded<DecisionEvaluationPipelineInput & { workflow: "consistency" }>) => {
    const byCategory = new Map<BrandDecisionCategory, BrandDecision[]>();
    for (const decision of input.decisions) {
      const rows = byCategory.get(decision.category) ?? [];
      rows.push(decision);
      byCategory.set(decision.category, rows);
    }
    const consistency = await runConsistencyGuardian(byCategory, input.grounding.content);
    if (!consistency.ok) return { ok: false as const, err: consistency.err, decisions: input };
    const state: EvaluationState = {
      evaluations: [],
      evaluationError: null,
      referenceIds: input.grounding.referenceIds,
    };
    for (const pair of consistency.result.pair_results
      .filter((result) => result.result === "NEEDS_REVIEW" || result.result === "INSUFFICIENT_EVIDENCE")
      .slice(0, 4)) {
      const categories = PAIR_CATEGORIES.find(([name]) => name === pair.pair)?.[1] ?? [];
      const related = categories.flatMap((category) => byCategory.get(category) ?? []).slice(0, 6);
      const target = related[0];
      if (!target) continue;
      const relatedEvaluated = related
        .filter((decision) => decision.id !== target.id)
        .map((decision) => decisionInput(decision, input.supportingIdsByDecisionId[decision.id] ?? []));
      appendEvaluation(
        state,
        await evaluateDecision({
          subject: pair.pair,
          decision: decisionInput(target, input.supportingIdsByDecisionId[target.id] ?? []),
          relatedDecisions: relatedEvaluated,
          approvedEvidence: evidenceFor(target.id, input),
          methodologyReferences: input.grounding.content,
          referenceIds: input.grounding.referenceIds,
        }),
      );
    }
    return {
      ok: true as const,
      result: { pair_results: consistency.result.pair_results, ...state },
      decisions: input,
    };
  },
);

const consistencyChain = critiqueRetrieval.pipe(consistencyRun);

export async function orchestrateConsistency(
  input: DecisionEvaluationPipelineInput,
): Promise<ConsistencyPipelineResult> {
  const result = await consistencyChain.invoke(
    { ...input, workflow: "consistency" as const },
    tracingConfig("brand:consistency-evaluator"),
  );
  if (!result.ok) return result;
  return { ok: true, result: result.result };
}
