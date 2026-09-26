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
import { summarizeChallengeRun } from "@/lib/challenge-run";
import { ConfirmCheck } from "@/app/components/confirm-check";

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
    <div className="space-y-1.5 border-l-2 border-border/60 pl-4">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <SectionLabel>Second opinion</SectionLabel>
        <span className={`eyebrow rounded-full border px-2 py-0.5 ${EVALUATION_STYLE[evaluation.verdict] ?? EVALUATION_STYLE.PASS}`}>
          {evaluation.verdict.replace("_", " ")}
        </span>
        <span className="text-[0.78rem] text-muted-foreground/80">
          {evaluation.provider === "jev" ? "TypeSafe Jev" : "Gemini"}
          {evaluation.confidence !== null
            ? ` · ${Math.round(evaluation.confidence * 100)}% confidence`
            : ""}
        </span>
      </div>
      <p className="text-[0.9rem] leading-relaxed text-muted-foreground whitespace-pre-wrap">
        {evaluation.explanation}
      </p>
      {evaluation.revisionGuidance && (
        <p className="text-[0.88rem] leading-relaxed text-muted-foreground/85 whitespace-pre-wrap">
          <span className="text-foreground/70">Where to revise:</span>{" "}
          {evaluation.revisionGuidance}
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
    <details className="space-y-3 text-[0.88rem] text-muted-foreground">
      <summary className="cursor-pointer select-none marker:text-muted-foreground/60">
        {checks.length} check{checks.length > 1 ? "s" : ""} could not be grounded — no
        verdict, nothing changed
      </summary>
      <ul className="mt-3 space-y-3 border-l border-border/60 pl-4">
        {checks.map((check) => (
          <li key={check.id} className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-3">
              <CategoryBadge cat={check.decision_category as BrandDecisionCategory} />
              <span className="eyebrow">{checkLabel(check.check_type)}</span>
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
  return <span className="eyebrow">{children}</span>;
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
    <span className="inline-flex items-center text-[0.78rem] border border-border/80 rounded-full px-2.5 py-0.5 text-muted-foreground">
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
      className="inline-flex h-10 items-center justify-center rounded-full border border-border px-4 text-sm font-medium text-foreground hover:border-foreground/40 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
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
      className="inline-flex h-10 items-center justify-center rounded-full border border-border bg-transparent px-4 text-sm font-medium text-muted-foreground hover:text-foreground hover:border-foreground/40 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
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
      className="inline-flex h-10 items-center justify-center rounded-full border border-border bg-transparent px-4 text-sm font-medium text-destructive hover:border-destructive/50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
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
      className="inline-flex h-10 items-center justify-center rounded-full border border-border bg-transparent px-4 text-sm font-medium text-foreground hover:border-foreground/40 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
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
      className="inline-flex h-10 items-center justify-center rounded-full border border-foreground bg-foreground px-4 text-sm font-medium text-background hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
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
      className="inline-flex h-11 items-center justify-center rounded-full border border-foreground bg-foreground px-5 text-sm font-medium text-background hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
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
      className="inline-flex h-10 items-center justify-center rounded-full border border-border bg-transparent px-4 text-sm font-medium text-muted-foreground hover:text-foreground hover:border-foreground/40 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
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
  const approved = appState.newState === "approved";
  const rejected = rejState.newState === "rejected";
  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <CategoryBadge cat={draft.category} />
        <h5 className="text-[1.05rem] leading-snug text-foreground">{draft.title}</h5>
      </div>
      <p className="text-[0.95rem] leading-relaxed whitespace-pre-wrap text-foreground/90">
        {draft.content}
      </p>
      {draft.rationale && (
        <p className="text-[0.88rem] leading-relaxed text-muted-foreground whitespace-pre-wrap border-l-2 border-border/60 pl-4">
          <span className="text-foreground/70">Why:</span> {draft.rationale}
        </p>
      )}
      {draft.uncertainty && (
        <p className="text-[0.88rem] leading-relaxed text-muted-foreground whitespace-pre-wrap">
          <span className="text-foreground/70">Not certain:</span> {draft.uncertainty}
        </p>
      )}

      {/* Approval resolves in place: the control is replaced by its result so
          the outcome is unmistakable without a toast. */}
      {approved ? (
        <span className="inline-flex h-10 items-center justify-center gap-2 rounded-full border border-primary/25 bg-accent/50 px-4 text-sm font-medium text-accent-foreground">
          <ConfirmCheck className="text-primary" />
          Revision approved
        </span>
      ) : rejected ? (
        <span className="inline-flex h-10 items-center justify-center rounded-full border border-border px-4 text-sm text-muted-foreground">
          Revision rejected
        </span>
      ) : (
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
      )}
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
    <li className="rise space-y-6 border-l-2 border-border/60 pl-5 sm:pl-7">
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
          <span
            className={`eyebrow rounded-full border px-2.5 py-0.5 ${
              SEVERITY_STYLE[issue.severity] ?? SEVERITY_STYLE.low
            }`}
          >
            {checkLabel(issue.check_type)}
          </span>
          <CategoryBadge cat={issue.affected_category} />
          {decision && (
            <span className="text-[0.9rem] text-foreground/90">{decision.title}</span>
          )}
        </div>

        <div className="space-y-2">
          <p className="eyebrow">The AI says</p>
          <h4 className="display text-[1.3rem] sm:text-[1.45rem] leading-snug max-w-2xl">
            {issue.issue_title}
          </h4>
          <p className="text-[1rem] leading-[1.7] text-foreground/90 whitespace-pre-wrap max-w-2xl">
            {issue.issue}
          </p>
        </div>

        <div className="space-y-1.5">
          <SectionLabel>Evidence it rests on</SectionLabel>
          <p className="text-[0.92rem] leading-relaxed text-muted-foreground whitespace-pre-wrap border-l-2 border-border/60 pl-4 max-w-2xl">
            {issue.evidence}
          </p>
        </div>

        <div className="space-y-1.5">
          <SectionLabel>What it proposes instead</SectionLabel>
          <p className="text-[0.98rem] leading-[1.65] text-foreground/90 whitespace-pre-wrap border-l-2 border-primary/30 pl-4 max-w-2xl">
            {issue.proposed_alternative}
          </p>
        </div>

        <EvaluationPanel
          evaluation={evaluations?.find(
            (evaluation) => evaluation.subject === issue.id,
          )}
        />
      </div>

      <div className="space-y-3">
        <SectionLabel>Your response</SectionLabel>
        <div className="flex flex-wrap items-center gap-3">
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
          <p className="text-[0.9rem] text-destructive">
            {error ?? alternativeState.error}
          </p>
        )}
      </div>

      {previews.length > 0 && (
        <div className="space-y-5 pt-4">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <SectionLabel>Proposed revision</SectionLabel>
            <span className="text-[0.8rem] text-muted-foreground/80">
              Approve in Brand to apply — nothing changes without you
            </span>
          </div>
          {previews.map((p) => (
            <RevisionPreviewCard key={p.tempId} draft={p} startupId={startupId} />
          ))}
        </div>
      )}
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
    <li className="rise space-y-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
        <span
          className={`eyebrow rounded-full border px-2.5 py-0.5 ${
            RESULT_STYLE[pair.result] ?? RESULT_STYLE.NEEDS_REVIEW
          }`}
        >
          {RESULT_LABEL[pair.result] ?? pair.result}
        </span>
        <span className="text-[1rem] text-foreground/90">{pair.pair}</span>
      </div>
      <p className="text-[0.95rem] leading-relaxed text-muted-foreground whitespace-pre-wrap max-w-2xl">
        {pair.explanation}
      </p>
      {pair.evidence.length > 0 && (
        <div className="space-y-1.5">
          <SectionLabel>Evidence</SectionLabel>
          <ul className="space-y-1.5 border-l-2 border-border/60 pl-4">
            {pair.evidence.map((quote) => (
              <li
                key={quote}
                className="text-[0.9rem] leading-relaxed text-muted-foreground whitespace-pre-wrap"
              >
                {quote}
              </li>
            ))}
          </ul>
        </div>
      )}
      {needsFix && (
        <div className="space-y-1.5">
          <SectionLabel>Suggested fix</SectionLabel>
          <p className="text-[0.95rem] leading-relaxed whitespace-pre-wrap text-foreground/90 border-l-2 border-primary/30 pl-4 max-w-2xl">
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
        <div className="space-y-4 pt-3">
          <SectionLabel>Proposed revision</SectionLabel>
          {pairPreviews.map((d) => (
            <RevisionPreviewCard key={d.tempId} draft={d} startupId={startupId} />
          ))}
        </div>
      )}
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
  // Same projection the server persisted, so the two cannot disagree.
  useEffect(() => {
    if (critiqueState.issues) {
      publishChallengeRun(
        summarizeChallengeRun(critiqueState.issues, critiqueState.checks ?? []),
      );
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
    <section className="space-y-16 max-w-3xl">
      <div className="space-y-3">
        <p className="eyebrow">Challenge</p>
        <h2 className="display text-[2.1rem] sm:text-[2.5rem] leading-[1.1]">
          Don’t agree with the AI just because it sounds confident.
        </h2>
        <p className="text-[0.98rem] leading-relaxed text-muted-foreground max-w-xl">
          The Brand Critic looks for generic language, contradictions, bias, audience
          mismatch, and claims with nothing behind them. The Consistency Guardian
          cross-checks every pair of decisions. Every finding quotes the exact wording
          it rests on, so you can judge it yourself.
        </p>
      </div>

      <div className="space-y-5 border-t border-border/70 pt-8">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-5">
          <div className="max-w-lg space-y-2">
            <h3 className="display text-[1.35rem]">Press the brand for weak spots</h3>
            <p className="text-[0.95rem] leading-relaxed text-muted-foreground">
              Findings appear as a conversation. You answer each one: keep the
              decision, reject it, or ask for a revision. Nothing changes until you do.
            </p>
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

        <div>
          <WorkflowDisclosure
            referenceIds={[critiqueState.referenceIds, consistencyState.referenceIds]}
            evaluationError={[critiqueState.evaluationError, consistencyState.evaluationError]}
          />
        </div>

        {(critiqueState.configError || consistencyState.configError) &&
          critiqueState.error && (
            <div className="rounded-2xl border border-border/80 bg-muted/30 p-5 space-y-2">
              <div className="eyebrow">AI not configured</div>
              <p className="text-[0.9rem] text-muted-foreground whitespace-pre-wrap leading-relaxed">
                {critiqueState.error ?? consistencyState.error}
              </p>
            </div>
          )}

        {!critiqueState.configError && critiqueState.error && (
          <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-5 text-[0.9rem] text-destructive whitespace-pre-wrap leading-relaxed">
            {critiqueState.error}
          </div>
        )}

        {!consistencyState.configError && consistencyState.error && (
          <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-5 text-[0.9rem] text-destructive whitespace-pre-wrap leading-relaxed">
            {consistencyState.error}
          </div>
        )}
      </div>

      {/* Issues area */}
      <div className="space-y-6">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <div className="space-y-1">
            <SectionLabel>Brand Critic</SectionLabel>
            <h3 className="display text-[1.35rem] mt-1">Issues found</h3>
          </div>
          {issues.length > 0 && (
            <div className="text-[0.85rem] text-muted-foreground flex items-center gap-3 tabular-nums">
              <span>
                <span className="text-foreground">
                  {severityCounts.high}
                </span>{" "}
                high
              </span>
              <span>
                <span className="text-foreground">
                  {severityCounts.medium}
                </span>{" "}
                medium
              </span>
              <span>
                <span className="text-foreground">
                  {severityCounts.low}
                </span>{" "}
                low
              </span>
              <span>·</span>
              <span>{dismissedIds.size} dismissed</span>
            </div>
          )}
        </div>

        {activeOnly.length === 0 && (
          <p className="text-[0.95rem] text-muted-foreground leading-relaxed max-w-xl">
            There are no active decisions yet. Generate a strategy in the Brand stage
            and approve at least one decision, then come back and challenge it.
          </p>
        )}

        {activeOnly.length > 0 && !critiqueState.issues && !critiqueState.error && (
          <p className="text-[0.95rem] text-muted-foreground leading-relaxed max-w-xl">
            Nothing has been challenged yet. Start with{" "}
            <span className="text-foreground/80">Challenge active brand decisions</span>{" "}
            above.
          </p>
        )}

        {visibleIssues.length === 0 && issues.length > 0 && (
          <p className="text-[0.98rem] leading-relaxed text-muted-foreground max-w-xl">
            Every issue has been dismissed. The brand looks clean — but keep applying
            your own judgment to it.
          </p>
        )}

        {visibleIssues.length > 0 && (
          <ul className="space-y-12">
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
          <div className="space-y-2 max-w-2xl">
            <p className="display text-[1.3rem]">Nothing needs your review.</p>
            <p className="text-[0.98rem] leading-relaxed text-muted-foreground">
              All five checks ran against {activeOnly.length} active decision
              {activeOnly.length === 1 ? "" : "s"} and found nothing worth arguing
              with. Keep building from the approved decisions, or challenge the
              reasoning behind any of them in the Brand stage.
            </p>
            {ungroundedChecks.length > 0 && (
              <p className="text-[0.88rem] leading-relaxed text-muted-foreground/85">
                {ungroundedChecks.length} check
                {ungroundedChecks.length === 1 ? "" : "s"} could not be grounded — the
                evidence for {ungroundedChecks.length === 1 ? "it" : "them"} is missing,
                so no verdict was reported. Details below.
              </p>
            )}
          </div>
        )}

        <UngroundedChecks checks={ungroundedChecks} />
      </div>

      {/* Consistency area */}
      <div className="space-y-6">
        <div className="rule" />
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <div className="space-y-1">
            <SectionLabel>Consistency Guardian</SectionLabel>
            <h3 className="display text-[1.35rem] mt-1">
              9 decision pair cross-checks
            </h3>
          </div>
          {consistencyResults && (
            <div className="text-[0.85rem] text-muted-foreground flex items-center gap-3 tabular-nums">
              <span>
                <span className="text-foreground">{consistencyCounts.PASS}</span> passed
              </span>
              <span>
                <span className="text-foreground">
                  {consistencyCounts.NEEDS_REVIEW}
                </span>{" "}
                need review
              </span>
              <span>
                <span className="text-foreground">
                  {consistencyCounts.INSUFFICIENT_EVIDENCE}
                </span>{" "}
                ungrounded
              </span>
              <span>
                <span className="text-foreground">
                  {consistencyCounts.NOT_CHECKED}
                </span>{" "}
                not checked
              </span>
            </div>
          )}
        </div>

        {!consistencyResults && !consistencyState.error && (
          <p className="text-[0.95rem] text-muted-foreground leading-relaxed max-w-xl">
            Not run yet. Use{" "}
            <span className="text-foreground/80">Run consistency check</span> above to
            evaluate all nine pairs.
          </p>
        )}

        {consistencyResults && (
          <ul className="space-y-8 border-l border-border/60 pl-5 sm:pl-8">
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
