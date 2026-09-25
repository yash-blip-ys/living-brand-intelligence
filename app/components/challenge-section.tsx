"use client";

import { useMemo, useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import {
  runChallengeCritique,
  dismissChallengeIssue,
  rejectDecisionFromChallenge,
  reviseDecisionFromChallenge,
  runConsistencyCheck,
  reviseDecisionFromConsistency,
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
import type { ConsistencyPairResult } from "@/lib/ai/consistency";
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

const RESULT_STYLE: Record<string, string> = {
  PASS: "border-emerald-600/60 text-emerald-700 dark:text-emerald-300 bg-emerald-500/5",
  "NEEDS REVIEW": "border-amber-600/50 text-amber-700 dark:text-amber-300 bg-amber-500/5",
  CONFLICT: "border-destructive/60 text-destructive bg-destructive/5",
};

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

const CRITIQUE_EMPTY: ChallengeCritiqueState = {};
const DISMISS_EMPTY: ChallengeDismissState = {};
const CONSISTENCY_EMPTY: ConsistencyCheckState = {};
const REVISE_EMPTY: ChallengeReviseState = {};

export function ChallengeSection({
  startupId,
  approvedContext,
  activeDecisions,
  decisionLinks,
}: Props) {
  const [critiqueState, critiqueDispatch] = useFormState(
    runChallengeCritique,
    CRITIQUE_EMPTY,
  );
  const [consistencyState, consistencyDispatch] = useFormState(
    runConsistencyCheck,
    CONSISTENCY_EMPTY,
  );

  const [dismissState] = useFormState(dismissChallengeIssue, DISMISS_EMPTY);

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

  const [revisionPreviews, setRevisionPreviews] = useState<
    Map<string, ProposedDecisionDraft[]>
  >(new Map());

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

  if (critiqueState.issues && issues.length === 0) {
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
    const c = { PASS: 0, "NEEDS REVIEW": 0, CONFLICT: 0 };
    for (const r of consistencyResults ?? []) c[r.result] += 1;
    return c;
  }, [consistencyResults]);

  // Per-issue revise states via local factory closure
  function IssueCard({ issue }: { issue: ChallengeIssue }) {
    const binder = makeIssueReviseBinder(issue);
    const [reviseState, reviseAction] = useFormState(binder.bindRevise, REVISE_EMPTY);
    const [rejectDecState, rejectDecAction] = useFormState(binder.bindReject, {});
    const [dismissIssueState, dismissIssueAction] = useFormState(binder.bindDismiss, DISMISS_EMPTY);
    void reviseState;
    void rejectDecState;
    void dismissIssueState;

    const decision = activeById.get(issue.affected_decision_id);

    if (reviseState.proposed && reviseState.proposed.length > 0) {
      const existing = revisionPreviews.get(issue.id);
      if (
        !existing ||
        existing.length !== reviseState.proposed.length ||
        existing.some(
          (d, idx) =>
            d.tempId !== reviseState.proposed![idx]!.tempId,
        )
      ) {
        setRevisionPreviews((prev) => {
          const m = new Map(prev);
          m.set(issue.id, reviseState.proposed!);
          return m;
        });
      }
    }

    const previews = revisionPreviews.get(issue.id) ?? [];

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
                {issue.severity}
              </span>
              <CategoryBadge cat={issue.affected_category} />
              {decision && (
                <span className="text-xs font-medium text-foreground">
                  {decision.title}
                </span>
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
          </div>

          {critiqueState.error && (
            <p className="text-xs text-destructive">{critiqueState.error}</p>
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

  function makeIssueReviseBinder(_issue: ChallengeIssue) {
    const bindRevise = async (
      s: ChallengeReviseState | undefined,
      f: FormData,
    ): Promise<ChallengeReviseState> => reviseDecisionFromChallenge(s, f);
    const bindReject = async (
      s: StrategyActionState | undefined,
      f: FormData,
    ): Promise<StrategyActionState> => rejectDecisionFromChallenge(s, f);
    const bindDismiss = async (s: ChallengeDismissState | undefined, f: FormData) =>
      dismissChallengeIssue(s, f);
    return { bindRevise, bindReject, bindDismiss };
  }

  function makePairReviseBinder(_pair: ConsistencyPairResult) {
    const bindPairRevise = async (
      s: ChallengeReviseState | undefined,
      f: FormData,
    ): Promise<ChallengeReviseState> => reviseDecisionFromConsistency(s, f);
    return { bindPairRevise };
  }

  function RevisionPreviewCard({
    draft,
    startupId,
  }: {
    draft: ProposedDecisionDraft;
    startupId: string;
  }) {
    const binder = useMemo(() => {
      const bindApprove = async (
        s: DecisionReviewState | undefined,
        f: FormData,
      ): Promise<DecisionReviewState> => strategyApprove(s, f);
      const bindReject = async (
        s: DecisionReviewState | undefined,
        f: FormData,
      ): Promise<DecisionReviewState> => strategyReject(s, f);
      return { bindApprove, bindReject };
    }, []);
    const [appState, appAction] = useFormState(binder.bindApprove, {});
    const [rejState, rejAction] = useFormState(binder.bindReject, {});
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

  function ConsistencyRow({ pair }: { pair: ConsistencyPairResult }) {
    const binder = makePairReviseBinder(pair);
    const [pairReviseState, pairReviseAction] = useFormState(binder.bindPairRevise, REVISE_EMPTY);
    const [initialPairProposed] = useState(pairReviseState.proposed);
    const [pairPreviews, setPairPreviews] = useState<ProposedDecisionDraft[]>(
      initialPairProposed ?? [],
    );
    void initialPairProposed;
    if (
      pairReviseState.proposed &&
      pairReviseState.proposed.length > 0 &&
      pairPreviews.length === 0
    ) {
      setPairPreviews(pairReviseState.proposed);
    }
    const needsFix = pair.result !== "PASS" && pair.suggested_fix;
    return (
      <li className="rounded-xl border border-border bg-card text-card-foreground">
        <div className="p-5 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span
                className={`inline-flex items-center text-[10px] uppercase tracking-[0.18em] border rounded-full px-2 py-0.5 font-medium ${
                  RESULT_STYLE[pair.result] ?? RESULT_STYLE["NEEDS REVIEW"]
                }`}
              >
                {pair.result}
              </span>
              <span className="text-sm font-medium text-foreground">{pair.pair}</span>
            </div>
          </div>
          <p className="text-xs leading-relaxed text-muted-foreground whitespace-pre-wrap">
            {pair.explanation}
          </p>
          {needsFix && (
            <div className="rounded-lg border border-amber-600/40 bg-amber-500/[0.04] p-4 space-y-1">
              <SectionLabel>Suggested fix</SectionLabel>
              <p className="text-xs leading-relaxed whitespace-pre-wrap pt-1 text-foreground">
                {pair.suggested_fix}
              </p>
            </div>
          )}
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

  return (
    <section className="space-y-8">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-xs uppercase tracking-[0.18em] text-muted-foreground mb-1">
            Challenge
          </h2>
          <p className="text-sm text-muted-foreground max-w-xl">
            Brand Critic detects clichés, contradictions, weak differentiation and other
            defects. Consistency Guardian cross-checks 9 decision pairs.
          </p>
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-card text-card-foreground p-6 sm:p-8 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div className="max-w-xl space-y-1">
            <h3 className="text-xl font-semibold leading-tight tracking-tight">
              Press the brand for weak spots
            </h3>
            <p className="text-sm leading-relaxed text-muted-foreground">
              Challenge finds defects in already-approved decisions. Consistency checks
              every decision pair for internal alignment. Resolve one at a time: Keep,
              Reject, or Suggest Revision.
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
              <li key={issue.id} className="contents">
                {IssueCard({ issue })}
              </li>
            ))}
          </ul>
        )}
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
                  {consistencyCounts["NEEDS REVIEW"]}
                </span>{" "}
                NEEDS REVIEW
              </span>
              <span>
                <span className="font-medium text-destructive">
                  {consistencyCounts.CONFLICT}
                </span>{" "}
                CONFLICT
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
              <li key={`${pair.pair}-${idx}`} className="contents">
                {ConsistencyRow({ pair })}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
