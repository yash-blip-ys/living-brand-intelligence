"use client";

import { useEffect, useMemo, useState, useActionState } from "react";
import { useFormStatus } from "react-dom";
import {
  runChallengeCritique,
  dismissChallengeIssue,
  rejectDecisionFromChallenge,
  reviseDecisionFromChallenge,
  runConsistencyCheck,
  reviseDecisionFromConsistency,
  useChallengeAlternative as applyChallengeAlternative,
  type ChallengeCritiqueState,
  type ConsistencyCheckState,
  type ChallengeDismissState,
  type ChallengeReviseState,
} from "@/app/actions/challenge";
import {
  approveStrategyDecision as strategyApprove,
  rejectStrategyDecision as strategyReject,
  type ProposedDecisionDraft,
  type DecisionReviewState,
  type StrategyActionState,
} from "@/app/actions/strategy";
import type { BrandDecision, BrandDecisionCategory, ContextItem } from "@/lib/types/database";
import type { ChallengeIssue } from "@/lib/ai/challenge";
import { checkLabel, insufficientEvidenceChecks, type BrandCheck } from "@/lib/ai/brand-checks";
import { useStageProgress } from "@/app/components/stage-progress";import type { ConsistencyPairResult } from "@/lib/ai/consistency";
import type { BrandEvaluation } from "@/lib/ai/evaluation/evaluator";
import type { DecisionContextSupport } from "@/lib/db/brand-decisions";

type Props = {
  startupId: string;
  approvedContext: ContextItem[];
  activeDecisions: BrandDecision[];
  decisionLinks: DecisionContextSupport[];
};

const SEVERITY_STYLE: Record<string, string> = {
  high: "border-destructive/60 text-destructive bg-destructive/5",
  medium: "border-amber-600/50 text-amber-700 dark:text-amber-300 bg-amber-500/5",
  low: "border-emerald-600/50 text-emerald-700 dark:text-emerald-300 bg-emerald-500/5",
};

const RESULT_LABEL: Record<string, string> = {
  PASS: "Pass",
  NEEDS_REVIEW: "Needs review",
  INSUFFICIENT_EVIDENCE: "Insufficient evidence",
  NOT_CHECKED: "Not checked",
};

const RESULT_STYLE: Record<string, string> = {
  PASS: "border-emerald-600/60 text-emerald-700 dark:text-emerald-300 bg-emerald-500/5",
  NEEDS_REVIEW: "border-amber-600/50 text-amber-700 dark:text-amber-300 bg-amber-500/5",
  INSUFFICIENT_EVIDENCE: "border-border text-muted-foreground bg-muted/20",
  NOT_CHECKED: "border-border text-muted-foreground bg-muted/20",
};

const EVALUATION_STYLE: Record<string, string> = {
  PASS: "border-emerald-600/60 text-emerald-700 dark:text-emerald-300 bg-emerald-500/5",
  NEEDS_REVIEW: "border-amber-600/50 text-amber-700 dark:text-amber-300 bg-amber-500/5",
  REVISE: "border-destructive/60 text-destructive bg-destructive/5",
};

const CRITIQUE_EMPTY: ChallengeCritiqueState = {};
const DISMISS_EMPTY: ChallengeDismissState = {};
const CONSISTENCY_EMPTY: ConsistencyCheckState = {};
const REVISE_EMPTY: ChallengeReviseState = {};

/* Stable module-level action bindings: keeping the action identity constant across
   renders is what allows useActionState to hold state instead of resetting. */
const bindIssueRevise = async (
  s: ChallengeReviseState | undefined,
  f: FormData,
): Promise<ChallengeReviseState> => reviseDecisionFromChallenge(s, f);
const bindIssueReject = async (
  s: StrategyActionState | undefined,
  f: FormData,
): Promise<StrategyActionState> => rejectDecisionFromChallenge(s, f);
const bindIssueDismiss = async (
  s: ChallengeDismissState | undefined,
  f: FormData,
): Promise<ChallengeDismissState> => dismissChallengeIssue(s, f);
const bindPairRevise = async (
  s: ChallengeReviseState | undefined,
  f: FormData,
): Promise<ChallengeReviseState> => reviseDecisionFromConsistency(s, f);
const bindUseAlternative = async (
  s: StrategyActionState | undefined,
  f: FormData,
): Promise<StrategyActionState> => applyChallengeAlternative(s, f);
const bindRevisionApprove = async (
  s: DecisionReviewState | undefined,
  f: FormData,
): Promise<DecisionReviewState> => strategyApprove(s, f);
const bindRevisionReject = async (
  s: DecisionReviewState | undefined,
  f: FormData,
): Promise<DecisionReviewState> => strategyReject(s, f);

function EvaluationPanel({ evaluation }: { evaluation?: BrandEvaluation }) {
  if (!evaluation) return null;
  return (
    <div className="rounded-lg border border-border bg-muted/20 p-4 space-y-1">
      <div className="flex flex-wrap items-center gap-2">
        <SectionLabel>Decision evaluation</SectionLabel>
        <span
          className={`inline-flex items-center text-[10px] uppercase tracking-[0.18em] border rounded-full px-2 py-0.5 font-medium ${
            EVALUATION_STYLE[evaluation.verdict] ?? EVALUATION_STYLE.PASS
          }`}
        >
          {evaluation.verdict.replace("_", " ")}
        </span>
        <span className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
          {evaluation.provider === "jev" ? "TypeSafe Jev" : "Gemini"}
        </span>
        {evaluation.confidence !== null && (
          <span className="text-[10px] text-muted-foreground">
            {Math.round(evaluation.confidence * 100)}% confidence
          </span>
        )}
      </div>
      <p className="text-xs leading-relaxed text-foreground whitespace-pre-wrap pt-1">
        {evaluation.explanation}
      </p>
      {evaluation.revisionGuidance && (
        <p className="text-xs leading-relaxed text-muted-foreground whitespace-pre-wrap">
          Bounded revision direction: {evaluation.revisionGuidance}
        </p>
      )}
    </div>
  );
}

const REFERENCE_LABEL: Record<string, string> = {
  positioning: "Positioning",
  naming: "Naming",
  voice: "Voice",
  visual: "Visual",
  critique: "Critique",
  consistency: "Consistency",
  launch: "Launch",
};

/**
 * Secondary, collapsed view of the AI pipeline. Kept compact so the Brand Critic
 * issues stay the primary content; the RAG sources stay visible on the summary line.
 */
function WorkflowDisclosure({
  referenceIds,
  evaluationError,
}: {
  referenceIds?: (string[] | null | undefined)[];
  evaluationError?: (string | null | undefined)[];
}) {
  const sources = Array.from(
    new Set(
      (referenceIds ?? [])
        .flatMap((ids) => ids ?? [])
        .map((id) => REFERENCE_LABEL[id] ?? id),
    ),
  );
  const unavailable = (evaluationError ?? []).some((err) => Boolean(err));
  return (
    <details className="group text-[11px] text-muted-foreground">
      <summary className="cursor-pointer select-none marker:text-muted-foreground/60">
        RAG grounding
        {sources.length > 0 ? ` · ${sources.join(" · ")}` : ""} · Brand decisions
        {unavailable ? " · evaluator unavailable, results preserved" : ""}
      </summary>
      <ol className="mt-2 flex flex-wrap gap-x-4 gap-y-1 pl-4 list-decimal">
        <li>Retrieve references</li>
        <li>Critique / Consistency</li>
        <li>Evaluate</li>
        <li>Bounded revision</li>
        <li>Founder approval</li>
      </ol>
    </details>
  );
}

/**
 * Checks the critic could not ground. They are not defects, so they get their
 * own quiet surface instead of inflating the issue list or disappearing.
 */
function UngroundedChecks({ checks }: { checks: BrandCheck[] }) {
  if (checks.length === 0) return null;
  return (
    <details className="rounded-xl border border-dashed border-border bg-muted/20 p-4 text-xs text-muted-foreground">
      <summary className="cursor-pointer select-none">
        {checks.length} check{checks.length > 1 ? "s" : ""} could not be grounded — no verdict, nothing changed
      </summary>
      <ul className="mt-3 space-y-2">
        {checks.map((check) => (
          <li key={check.id} className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <CategoryBadge cat={check.decision_category as BrandDecisionCategory} />
              <span className="text-[10px] uppercase tracking-[0.18em]">
                {checkLabel(check.check_type)}
              </span>
            </div>
            {check.reason && <p className="leading-relaxed">{check.reason}</p>}
            {check.evidence.length > 0 && (
              <p className="leading-relaxed whitespace-pre-wrap opacity-80">
                {check.evidence.join("\n")}
              </p>
            )}
          </li>
        ))}
      </ul>
    </details>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
      {children}
    </span>
  );
}

function CategoryBadge({ cat }: { cat: BrandDecisionCategory }) {
  const labels: Record<string, string> = {
    AUDIENCE: "Audience",
    POSITIONING: "Positioning",
    VALUE_PROPOSITION: "Value Prop",
    DIFFERENTIATION: "Differentiation",
    PERSONALITY: "Personality",
    NAMING: "Naming",
    TAGLINE: "Tagline",
    VOICE: "Voice",
    MESSAGING: "Messaging",
    VISUAL_DIRECTION: "Visual Direction",
    LAUNCH: "Launch",
  };
  return (
    <span className="inline-flex items-center text-[10px] uppercase tracking-[0.18em] border border-border px-2 py-0.5 rounded-full text-muted-foreground bg-background">
      {labels[cat] ?? cat}
    </span>
  );
}

function CritiqueButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex h-11 items-center justify-center rounded-full border border-foreground bg-foreground px-6 text-sm font-medium text-background hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
    >
      {pending ? "Challenging decisions…" : "Challenge active brand decisions"}
    </button>
  );
}

function ConsistencyButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex h-9 items-center justify-center rounded-full border border-border bg-background px-4 text-xs font-medium text-foreground hover:bg-muted/40 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
    >
      {pending ? "Checking consistency…" : "Run consistency check"}
    </button>
  );
}

function KeepButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex h-8 items-center justify-center rounded-full border border-border bg-background px-4 text-xs font-medium text-muted-foreground hover:text-foreground hover:border-muted-foreground disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
    >
      {pending ? "Dismissing…" : "Keep"}
    </button>
  );
}

function RejectDecisionButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex h-8 items-center justify-center rounded-full border border-destructive/60 bg-transparent px-4 text-xs font-medium text-destructive hover:bg-destructive/5 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
    >
      {pending ? "Rejecting…" : "Reject decision"}
    </button>
  );
}

function UseAlternativeButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex h-8 items-center justify-center rounded-full border border-emerald-600/50 bg-emerald-500/[0.06] px-4 text-xs font-medium text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/10 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
    >
      {pending ? "Preparing…" : "Use alternative"}
    </button>
  );
}

function SuggestRevisionButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex h-8 items-center justify-center rounded-full border border-foreground/40 bg-foreground/[0.04] px-4 text-xs font-medium text-foreground hover:bg-foreground hover:text-background disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
    >
      {pending ? "Proposing revision…" : "Suggest revision"}
    </button>
  );
}

function ApproveRevisionButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex h-8 items-center justify-center rounded-full border border-foreground bg-foreground px-4 text-xs font-medium text-background hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
    >
      {pending ? "Approving…" : "Approve revision"}
    </button>
  );
}

function RejectRevisionButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex h-8 items-center justify-center rounded-full border border-border bg-transparent px-4 text-xs font-medium text-muted-foreground hover:text-foreground hover:border-muted-foreground disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
    >
      {pending ? "Rejecting…" : "Reject revision"}
    </button>
  );
}

function RevisionPreviewCard({
  draft,
  startupId,
}: {
  draft: ProposedDecisionDraft;
  startupId: string;
}) {
  const [appState, appAction] = useActionState(bindRevisionApprove, {});
  const [rejState, rejAction] = useActionState(bindRevisionReject, {});
  void appState;
  void rejState;
  return (
    <div className="rounded-xl border border-emerald-600/30 bg-card overflow-hidden">
      <div className="p-5 space-y-3">
        <div className="flex items-center gap-2">
          <CategoryBadge cat={draft.category} />
          <h5 className="text-sm font-semibold text-foreground tracking-tight">
            {draft.title}
          </h5>
        </div>
        <p className="text-xs leading-relaxed whitespace-pre-wrap text-foreground">
          {draft.content}
        </p>
        {draft.rationale && (
          <div className="text-[11px] leading-relaxed text-muted-foreground border-l-2 border-border pl-2.5 whitespace-pre-wrap">
            <span className="uppercase tracking-[0.18em] mr-1.5 text-[9px]">Rationale</span>
            {draft.rationale}
          </div>
        )}
        {draft.uncertainty && (
          <div className="text-[11px] text-amber-700 dark:text-amber-300 whitespace-pre-wrap">
            <span className="uppercase tracking-[0.18em] mr-1.5 text-[9px]">Uncertainty</span>
            {draft.uncertainty}
          </div>
        )}
        <div className="flex items-center gap-3 flex-wrap pt-1">
          <form action={appAction} className="contents">
            <input type="hidden" name="startupId" value={startupId} />
            <input type="hidden" name="tempId" value={draft.tempId} />
            <input type="hidden" name="category" value={draft.category} />
            <input type="hidden" name="title" value={draft.title} />
            <input type="hidden" name="content" value={draft.content} />
            <input type="hidden" name="rationale" value={draft.rationale} />
            <input
              type="hidden"
              name="uncertainty"
              value={draft.uncertainty ?? ""}
            />
            <input
              type="hidden"
              name="supporting_context_ids"
              value={draft.supporting_context_ids.join(",")}
            />
            <input type="hidden" name="persistedId" value={draft.persistedId ?? ""} />
            <ApproveRevisionButton />
          </form>
          <form action={rejAction} className="contents">
            <input type="hidden" name="startupId" value={startupId} />
            <input type="hidden" name="tempId" value={draft.tempId} />
            <input type="hidden" name="category" value={draft.category} />
            <input type="hidden" name="title" value={draft.title} />
            <input type="hidden" name="content" value={draft.content} />
            <input type="hidden" name="rationale" value={draft.rationale} />
            <RejectRevisionButton />
          </form>
        </div>
      </div>
    </div>
  );
}

function IssueCard({
  issue,
  decision,
  startupId,
  evaluations,
  error,
}: {
  issue: ChallengeIssue;
  decision?: BrandDecision;
  startupId: string;
  evaluations?: BrandEvaluation[] | null;
  error?: string;
}) {
  const [reviseState, reviseAction] = useActionState(bindIssueRevise, REVISE_EMPTY);
  const [rejectDecState, rejectDecAction] = useActionState(bindIssueReject, {});
  const [dismissIssueState, dismissIssueAction] = useActionState(
    bindIssueDismiss,
    DISMISS_EMPTY,
  );
  void rejectDecState;
  void dismissIssueState;

  const [previews, setPreviews] = useState<ProposedDecisionDraft[]>([]);
  const [alternativeState, alternativeAction] = useActionState(
    bindUseAlternative,
    REVISE_EMPTY,
  );
  const proposed =
    reviseState.proposed ?? alternativeState.proposed ?? null;
  if (proposed && proposed.length > 0 && previews !== proposed) {
    setPreviews(proposed);
  }

  return (
    <li className="rounded-xl border border-border bg-card text-card-foreground overflow-hidden">
      <div className="p-5 sm:p-6 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`inline-flex items-center text-[10px] uppercase tracking-[0.18em] border rounded-full px-2 py-0.5 font-medium ${
                SEVERITY_STYLE[issue.severity] ?? SEVERITY_STYLE.low
              }`}
            >
              {checkLabel(issue.check_type)}
            </span>
            <CategoryBadge cat={issue.affected_category} />
            {decision && (
              <span className="text-xs font-medium text-foreground">{decision.title}</span>
            )}
          </div>
          <SectionLabel>Issue</SectionLabel>
        </div>

        <div>
          <h4 className="text-sm font-semibold text-foreground mb-1.5 tracking-tight">
            {issue.issue_title}
          </h4>
          <p className="text-sm leading-relaxed text-foreground whitespace-pre-wrap">
            {issue.issue}
          </p>
        </div>

        <div className="rounded-lg border border-border bg-muted/20 p-4 space-y-1">
          <SectionLabel>Evidence</SectionLabel>
          <p className="text-xs leading-relaxed text-muted-foreground whitespace-pre-wrap pt-1">
            {issue.evidence}
          </p>
        </div>

        <div className="rounded-lg border border-emerald-600/30 bg-emerald-500/[0.04] p-4 space-y-1">
          <SectionLabel>Proposed alternative</SectionLabel>
          <p className="text-xs leading-relaxed text-foreground whitespace-pre-wrap pt-1">
            {issue.proposed_alternative}
          </p>
        </div>

        <EvaluationPanel
          evaluation={evaluations?.find(
            (evaluation) => evaluation.subject === issue.id,
          )}
        />

        <div className="flex flex-wrap items-center gap-3 pt-2">
          <form action={dismissIssueAction} className="contents">
            <input type="hidden" name="issueId" value={issue.id} />
            <KeepButton />
          </form>
          <form action={rejectDecAction} className="contents">
            <input type="hidden" name="startupId" value={startupId} />
            <input type="hidden" name="decisionId" value={issue.affected_decision_id} />
            <RejectDecisionButton />
          </form>
          <form action={reviseAction} className="contents">
            <input type="hidden" name="startupId" value={startupId} />
            <input type="hidden" name="category" value={issue.affected_category} />
            <input
              type="hidden"
              name="challengeGuidance"
              value={`ISSUE: ${issue.issue_title}\n${issue.issue}\n\nEVIDENCE:\n${issue.evidence}\n\nPROPOSED ALTERNATIVE:\n${issue.proposed_alternative}`}
            />
            <input type="hidden" name="affectedDecisionId" value={issue.affected_decision_id} />
            <SuggestRevisionButton />
          </form>
          <form action={alternativeAction} className="contents">
            <input type="hidden" name="startupId" value={startupId} />
            <input type="hidden" name="decisionId" value={issue.affected_decision_id} />
            <input type="hidden" name="category" value={issue.affected_category} />
            <input
              type="hidden"
              name="alternative"
              value={issue.proposed_alternative}
            />
            <UseAlternativeButton />
          </form>
        </div>

        {(error ?? alternativeState.error) && (
          <p className="text-xs text-destructive">
            {error ?? alternativeState.error}
          </p>
        )}

        {previews.length > 0 && (
          <div className="border-t border-border pt-5 space-y-4">
            <div className="flex items-center justify-between">
              <SectionLabel>Proposed revision · for founder review</SectionLabel>
              <span className="text-[10px] uppercase tracking-[0.18em] text-emerald-700 dark:text-emerald-300">
                Approve in Brand tab to apply
              </span>
            </div>
            {previews.map((p) => (
              <RevisionPreviewCard key={p.tempId} draft={p} startupId={startupId} />
            ))}
          </div>
        )}
      </div>
    </li>
  );
}

function ConsistencyRow({
  pair,
  startupId,
  evaluations,
}: {
  pair: ConsistencyPairResult;
  startupId: string;
  evaluations?: BrandEvaluation[] | null;
}) {
  const [pairReviseState, pairReviseAction] = useActionState(bindPairRevise, REVISE_EMPTY);
  const [pairPreviews, setPairPreviews] = useState<ProposedDecisionDraft[]>([]);
  if (
    pairReviseState.proposed &&
    pairReviseState.proposed.length > 0 &&
    pairPreviews !== pairReviseState.proposed
  ) {
    setPairPreviews(pairReviseState.proposed);
  }
  const needsFix = pair.result === "NEEDS_REVIEW" && Boolean(pair.suggested_fix);
  return (
    <li className="rounded-xl border border-border bg-card text-card-foreground">
      <div className="p-5 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span
              className={`inline-flex items-center text-[10px] uppercase tracking-[0.18em] border rounded-full px-2 py-0.5 font-medium ${
                RESULT_STYLE[pair.result] ?? RESULT_STYLE.NEEDS_REVIEW
              }`}
            >
              {RESULT_LABEL[pair.result] ?? pair.result}
            </span>
            <span className="text-sm font-medium text-foreground">{pair.pair}</span>
          </div>
        </div>
        <p className="text-xs leading-relaxed text-muted-foreground whitespace-pre-wrap">
          {pair.explanation}
        </p>
        {pair.evidence.length > 0 && (
          <div className="rounded-lg border border-border bg-muted/20 p-4 space-y-1">
            <SectionLabel>Evidence</SectionLabel>
            <ul className="pt-1 space-y-1 list-disc pl-4">
              {pair.evidence.map((quote) => (
                <li
                  key={quote}
                  className="text-xs leading-relaxed text-muted-foreground whitespace-pre-wrap"
                >
                  {quote}
                </li>
              ))}
            </ul>
          </div>
        )}
        {needsFix && (
          <div className="rounded-lg border border-amber-600/40 bg-amber-500/[0.04] p-4 space-y-1">
            <SectionLabel>Suggested fix</SectionLabel>
            <p className="text-xs leading-relaxed whitespace-pre-wrap pt-1 text-foreground">
              {pair.suggested_fix}
            </p>
          </div>
        )}
        <EvaluationPanel
          evaluation={evaluations?.find(
            (evaluation) => evaluation.subject === pair.pair,
          )}
        />
        {needsFix && (
          <form action={pairReviseAction} className="contents">
            <input type="hidden" name="startupId" value={startupId} />
            <input type="hidden" name="pair" value={pair.pair} />
            <input type="hidden" name="suggestedFix" value={pair.suggested_fix ?? ""} />
            <div className="pt-1">
              <SuggestRevisionButton />
            </div>
          </form>
        )}
        {pairPreviews.length > 0 && (
          <div className="space-y-3 pt-3 border-t border-border">
            {pairPreviews.map((d) => (
              <RevisionPreviewCard key={d.tempId} draft={d} startupId={startupId} />
            ))}
          </div>
        )}
      </div>
    </li>
  );
}

export function ChallengeSection({
  startupId,
  approvedContext,
  activeDecisions,
  decisionLinks,
}: Props) {
  const [critiqueState, critiqueDispatch] = useActionState(
    runChallengeCritique,
    CRITIQUE_EMPTY,
  );
  const [consistencyState, consistencyDispatch] = useActionState(
    runConsistencyCheck,
    CONSISTENCY_EMPTY,
  );

  const [dismissState] = useActionState(dismissChallengeIssue, DISMISS_EMPTY);

  const [initialIssuesSeed] = useState<ChallengeIssue[] | undefined>(
    critiqueState.issues ?? undefined,
  );
  const [issues, setIssues] = useState<ChallengeIssue[]>(
    initialIssuesSeed ? [...initialIssuesSeed] : [],
  );
  const [initialDismissedSeed] = useState<string | undefined>(
    dismissState.dismissedIssueId,
  );
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(() => {
    const s = new Set<string>();
    if (initialDismissedSeed) s.add(initialDismissedSeed);
    return s;
  });
  void initialDismissedSeed;

  const [initialConsistencySeed] = useState<
    ConsistencyPairResult[] | undefined
  >(consistencyState.pair_results ?? undefined);
  const [consistencyResults, setConsistencyResults] = useState<
    ConsistencyPairResult[] | null
  >(initialConsistencySeed ? [...initialConsistencySeed] : null);

  const activeOnly = useMemo(
    () => activeDecisions.filter((d) => d.status === "active"),
    [activeDecisions],
  );
  const activeById = useMemo(() => {
    const m = new Map<string, BrandDecision>();
    for (const d of activeOnly) m.set(d.id, d);
    return m;
  }, [activeOnly]);
  void approvedContext;
  void decisionLinks;

  if (critiqueState.issues && issues !== critiqueState.issues) {
    setIssues(critiqueState.issues);
  }
  if (dismissState.dismissedIssueId && !dismissedIds.has(dismissState.dismissedIssueId)) {
    setDismissedIds(
      (prev) => new Set(prev).add(dismissState.dismissedIssueId!),
    );
  }
  if (consistencyState.pair_results && consistencyResults === null) {
    setConsistencyResults(consistencyState.pair_results);
  }

  const visibleIssues = useMemo(
    () => issues.filter((i) => !dismissedIds.has(i.id)),
    [issues, dismissedIds],
  );
  const severityCounts = useMemo(() => {
    const c = { high: 0, medium: 0, low: 0 };
    for (const i of visibleIssues) c[i.severity] += 1;
    return c;
  }, [visibleIssues]);
  const consistencyCounts = useMemo(() => {
    const c = { PASS: 0, NEEDS_REVIEW: 0, INSUFFICIENT_EVIDENCE: 0, NOT_CHECKED: 0 };
    for (const r of consistencyResults ?? []) c[r.result] += 1;
    return c;
  }, [consistencyResults]);
  const ungroundedChecks = useMemo(
    () => insufficientEvidenceChecks(critiqueState.checks ?? []),
    [critiqueState.checks],
  );
  // A completed run is a finished Challenge, whether it found reviewable
  // defects or not. The stage is marked from the run itself, never from
  // whether the result happened to be non-empty.
  const critiqueCompleted = Boolean(critiqueState.issues) && !critiqueState.error;
  const { markCompleted, publishChallengeRun, publishConsistencyRun } = useStageProgress();
  useEffect(() => {
    if (critiqueCompleted) markCompleted("challenge");
  }, [critiqueCompleted, markCompleted]);
  // Publish what the run actually returned, so the Deliver Quality cards report
  // this run instead of a placeholder. Nothing is derived from assumptions here.
  useEffect(() => {
    if (critiqueState.issues) {
      const returned = critiqueState.issues;
      publishChallengeRun({
        status: "complete",
        issueCount: returned.length,
        high: returned.filter((i) => i.severity === "high").length,
        medium: returned.filter((i) => i.severity === "medium").length,
        low: returned.filter((i) => i.severity === "low").length,
        checksRun: (critiqueState.checks ?? []).length,
        ungrounded: (critiqueState.checks ?? []).filter(
          (c) => c.status === "INSUFFICIENT_EVIDENCE",
        ).length,
      });
    } else if (critiqueState.error) {
      publishChallengeRun({
        status: "error",
        issueCount: 0,
        high: 0,
        medium: 0,
        low: 0,
        checksRun: 0,
        ungrounded: 0,
        error: critiqueState.error,
      });
    }
  }, [critiqueState, publishChallengeRun]);
  useEffect(() => {
    const rows = consistencyState.pair_results;
    if (rows) {
      publishConsistencyRun({
        status: "complete",
        total: rows.length,
        pass: rows.filter((r) => r.result === "PASS").length,
        needsReview: rows.filter((r) => r.result === "NEEDS_REVIEW").length,
        insufficientEvidence: rows.filter((r) => r.result === "INSUFFICIENT_EVIDENCE").length,
        notChecked: rows.filter((r) => r.result === "NOT_CHECKED").length,
      });
    } else if (consistencyState.error) {
      publishConsistencyRun({
        status: "error",
        total: 0,
        pass: 0,
        needsReview: 0,
        insufficientEvidence: 0,
        notChecked: 0,
        error: consistencyState.error,
      });
    }
  }, [consistencyState, publishConsistencyRun]);

  return (
    <section className="space-y-8">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-xs uppercase tracking-[0.18em] text-muted-foreground mb-1">
            Challenge
          </h2>
          <p className="text-sm text-muted-foreground max-w-xl">
            Brand Critic checks each active decision for generic language, contradictions,
            bias, audience mismatch, and unsupported claims. Consistency Guardian
            cross-checks 9 decision pairs. Every finding quotes the wording it rests on.
          </p>
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-card text-card-foreground p-5 sm:p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div className="max-w-xl space-y-1">
            <h3 className="text-lg font-semibold leading-tight tracking-tight">
              Press the brand for weak spots
            </h3>
            <p className="text-sm leading-relaxed text-muted-foreground">
              Challenge finds defects in already-approved decisions. Consistency checks
              every decision pair for internal alignment. Resolve one at a time: Keep,
              Reject, or Suggest Revision.
            </p>
            <div className="pt-1">
              <WorkflowDisclosure
                referenceIds={[critiqueState.referenceIds, consistencyState.referenceIds]}
                evaluationError={[critiqueState.evaluationError, consistencyState.evaluationError]}
              />
            </div>
          </div>
          <div className="flex flex-col sm:items-end gap-3">
            <form action={critiqueDispatch} className="contents">
              <input type="hidden" name="startupId" value={startupId} />
              <CritiqueButton />
            </form>
            <form action={consistencyDispatch} className="contents">
              <input type="hidden" name="startupId" value={startupId} />
              <ConsistencyButton />
            </form>
          </div>
        </div>

        {(critiqueState.configError || consistencyState.configError) &&
          critiqueState.error && (
            <div className="rounded-xl border border-border bg-muted/40 p-5 space-y-2">
              <div className="text-[11px] uppercase tracking-[0.18em] font-medium text-foreground">
                AI not configured
              </div>
              <p className="text-sm text-muted-foreground whitespace-pre-wrap leading-relaxed">
                {critiqueState.error ?? consistencyState.error}
              </p>
            </div>
          )}

        {!critiqueState.configError && critiqueState.error && (
          <div className="rounded-xl border border-destructive/40 bg-destructive/5 p-5 text-sm text-destructive whitespace-pre-wrap leading-relaxed">
            {critiqueState.error}
          </div>
        )}

        {!consistencyState.configError && consistencyState.error && (
          <div className="rounded-xl border border-destructive/40 bg-destructive/5 p-5 text-sm text-destructive whitespace-pre-wrap leading-relaxed">
            {consistencyState.error}
          </div>
        )}
      </div>

      {/* Issues area */}
      <div className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <SectionLabel>Brand Critic</SectionLabel>
            <h3 className="text-sm font-semibold tracking-tight mt-1 text-foreground">
              Issues found
            </h3>
          </div>
          {issues.length > 0 && (
            <div className="text-xs text-muted-foreground flex items-center gap-3">
              <span>
                <span className="font-medium text-destructive">
                  {severityCounts.high}
                </span>{" "}
                high
              </span>
              <span>
                <span className="font-medium text-amber-700 dark:text-amber-300">
                  {severityCounts.medium}
                </span>{" "}
                medium
              </span>
              <span>
                <span className="font-medium text-emerald-700 dark:text-emerald-300">
                  {severityCounts.low}
                </span>{" "}
                low
              </span>
              <span>·</span>
              <span>
                {dismissedIds.size} dismissed
              </span>
            </div>
          )}
        </div>

        {activeOnly.length === 0 && (
          <div className="rounded-xl border border-dashed border-border p-8 text-center space-y-2 text-sm text-muted-foreground">
            <span className="block uppercase tracking-[0.18em] text-[10px] mb-1">
              No active decisions
            </span>
            Generate strategy in the Brand tab, approve at least one decision, then
            return here to challenge it.
          </div>
        )}

        {activeOnly.length > 0 && !critiqueState.issues && !critiqueState.error && (
          <div className="rounded-xl border border-dashed border-border p-8 text-center space-y-2 text-sm text-muted-foreground">
            <span className="block uppercase tracking-[0.18em] text-[10px] mb-1">
              Challenge not run yet
            </span>
            Click &quot;Challenge active brand decisions&quot; above to begin.
          </div>
        )}

        {visibleIssues.length === 0 && issues.length > 0 && (
          <div className="rounded-xl border border-border bg-muted/20 p-6 text-sm text-muted-foreground text-center">
            All issues dismissed. Brand looks clean, but always apply founder judgment.
          </div>
        )}

        {visibleIssues.length > 0 && (
          <ul className="space-y-3">
            {visibleIssues.map((issue) => (
              <IssueCard
                key={issue.id}
                issue={issue}
                decision={activeById.get(issue.affected_decision_id)}
                startupId={startupId}
                evaluations={critiqueState.evaluations}
                error={critiqueState.error}
              />
            ))}
          </ul>
        )}

        {critiqueCompleted && issues.length === 0 && (
          <div className="rounded-xl border border-emerald-600/40 bg-emerald-500/[0.04] p-6 text-sm text-muted-foreground text-center space-y-1">
            <span className="block text-emerald-700 dark:text-emerald-300 font-medium">
              ✓ No issues found
            </span>
            <span className="block">
              The five checks ran against {activeOnly.length} active decision
              {activeOnly.length === 1 ? "" : "s"} and found nothing that needs your
              review. Keep working from the approved decisions, or challenge the
              reasoning behind any of them in the Brand tab.
            </span>
            {ungroundedChecks.length > 0 && (
              <span className="block text-xs">
                {ungroundedChecks.length} check
                {ungroundedChecks.length === 1 ? "" : "s"} could not be grounded — the
                evidence for {ungroundedChecks.length === 1 ? "it" : "them"} is missing,
                so no verdict was reported. Details below.
              </span>
            )}
          </div>
        )}

        <UngroundedChecks checks={ungroundedChecks} />
      </div>

      {/* Consistency area */}
      <div className="space-y-4 pt-4 border-t border-border">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <SectionLabel>Consistency Guardian</SectionLabel>
            <h3 className="text-sm font-semibold tracking-tight mt-1 text-foreground">
              9 decision pair cross-checks
            </h3>
          </div>
          {consistencyResults && (
            <div className="text-xs text-muted-foreground flex items-center gap-3">
              <span>
                <span className="font-medium text-emerald-700 dark:text-emerald-300">
                  {consistencyCounts.PASS}
                </span>{" "}
                PASS
              </span>
              <span>
                <span className="font-medium text-amber-700 dark:text-amber-300">
                  {consistencyCounts.NEEDS_REVIEW}
                </span>{" "}
                NEEDS REVIEW
              </span>
              <span>
                <span className="font-medium text-muted-foreground">
                  {consistencyCounts.INSUFFICIENT_EVIDENCE}
                </span>{" "}
                INSUFFICIENT EVIDENCE
              </span>
              <span>
                <span className="font-medium text-muted-foreground">
                  {consistencyCounts.NOT_CHECKED}
                </span>{" "}
                NOT CHECKED
              </span>
            </div>
          )}
        </div>

        {!consistencyResults && !consistencyState.error && (
          <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            <span className="block uppercase tracking-[0.18em] text-[10px] mb-1">
              Not run yet
            </span>
            Click &quot;Run consistency check&quot; above to evaluate all 9 pairs.
          </div>
        )}

        {consistencyResults && (
          <ul className="space-y-3">
            {consistencyResults.map((pair, idx) => (
              <ConsistencyRow
                key={`${pair.pair}-${idx}`}
                pair={pair}
                startupId={startupId}
                evaluations={consistencyState.evaluations}
              />
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
