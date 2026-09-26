"use client";

import { useMemo, useState, useActionState } from "react";
import { useFormStatus } from "react-dom";
import type {
  BrandDecision,
  ChangeAnalysis,
  ChangeAnalysisImpact,
  ChangeAnalysisStatus,
  ContextItem,
  ImpactSeverity,
} from "@/lib/types/database";
import {
  addFounderContext,
  runChangeAnalysisFromContext,
  approveRevisionForAnalysis,
  keepCurrentForAnalysis,
  rejectAnalysis,
  type AddContextState,
  type AnalyzeState,
  type ChangeImpactDraft,
  type ChangeAnalysisDraft,
  type FounderFactDraft,
  type ReviewState,
} from "@/app/actions/evolution";
import { toImpactType } from "@/lib/types/impact-types";
import { ConfirmCheck } from "@/app/components/confirm-check";

const UUID_PATTERN =
  /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi;

const LABELED_UUID_PATTERN = new RegExp(
  `\\b(fact|inference|hypothesis|assumption|context|evidence|decision)\\b[\\s:,#\\u2014-]*(${UUID_PATTERN.source})`,
  "gi",
);

const DRIFT_LABEL: Record<string, string> = {
  scope_expansion: "Scope expansion",
  scope_shift: "Scope shift",
  new_stakeholder: "New stakeholder",
  tone_shift: "Tone shift",
  contradiction: "Contradiction",
  repositioning: "Repositioning",
  new_evidence: "New evidence",
  misalignment: "Misalignment",
  opportunity: "Opportunity",
  risk: "Risk",
  audience_shift: "Audience shift",
  message_change: "Message change",
  other: "Other",
  review: "Needs review",
};

function driftLabel(drift: string): string {
  const key = drift.trim().toLowerCase().replace(/[\s-]+/g, "_");
  return (
    DRIFT_LABEL[key] ??
    key
      .split("_")
      .filter(Boolean)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" ")
  );
}

/**
 * Internal ids must never reach the reader. Stored rationales and model-written
 * explanations quote the ids of the items they reason about, so render them as
 * references instead of identifiers.
 */
function humanize(text: string | null | undefined): string {
  if (!text) return "";
  return text
    .replace(LABELED_UUID_PATTERN, "the $1")
    .replace(UUID_PATTERN, "the related item");
}

type Props = {
  startupId: string;
  initialFacts: FounderFactDraft[];
  initialAnalyses: ChangeAnalysis[];
  initialImpacts: ChangeAnalysisImpact[];
  activeDecisions: BrandDecision[];
  approvedContext: ContextItem[];
  decisionContextLinks: Array<{ decision_id: string; context_item_id: string }>;
};

const SEVERITY_STYLE: Record<ImpactSeverity, string> = {
  high: "border-destructive/60 text-destructive bg-destructive/5",
  medium: "border-amber-600/50 text-amber-700 dark:text-amber-300 bg-amber-500/5",
  low: "border-emerald-600/50 text-emerald-700 dark:text-emerald-300 bg-emerald-500/5",
};

const STATUS_LABEL: Record<ChangeAnalysisStatus, string> = {
  pending: "Pending review",
  approved: "Revision approved",
  rejected: "Rejected",
  ignored: "Kept current",
};

const STATUS_TONE: Record<ChangeAnalysisStatus, string> = {
  pending: "border-border text-foreground",
  approved: "border-emerald-600/60 text-emerald-700 dark:text-emerald-300",
  rejected: "border-destructive/60 text-destructive",
  ignored: "border-border text-muted-foreground",
};

/* Fixed locale and zone: the server and the browser must render the same string,
   otherwise this client component fails hydration on a locale/timezone mismatch. */
const TIMESTAMP_FORMAT = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "UTC",
});

function formatTimestamp(value: string | null | undefined): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return `${TIMESTAMP_FORMAT.format(date)} UTC`;
}

function AddContextButton({ disabled }: { disabled?: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={disabled || pending}
      className="inline-flex h-11 items-center justify-center rounded-full border border-foreground bg-foreground px-5 text-sm font-medium text-background hover:opacity-90 disabled:opacity-60 disabled:cursor-not-allowed transition-opacity"
    >
      {pending ? "Adding…" : "Add as new fact"}
    </button>
  );
}

function AnalyzeButton({ disabled }: { disabled?: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={disabled || pending}
      className="inline-flex h-10 items-center justify-center rounded-full border border-border px-4 text-sm font-medium text-foreground hover:border-foreground/40 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
    >
      {pending ? "Analyzing…" : "Analyze impact"}
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

function KeepCurrentButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex h-11 items-center justify-center rounded-full border border-border bg-transparent px-5 text-sm font-medium text-muted-foreground hover:text-foreground hover:border-muted-foreground disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
    >
      {pending ? "Processing…" : "Keep current"}
    </button>
  );
}

function RejectButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex h-11 items-center justify-center rounded-full border border-border bg-transparent px-5 text-sm font-medium text-destructive hover:border-destructive/60 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
    >
      {pending ? "Rejecting…" : "Reject analysis"}
    </button>
  );
}

const ADD_EMPTY: AddContextState = {};
const ANALYZE_EMPTY: AnalyzeState = {};

function buildImpactDraft(
  imp: ChangeAnalysisImpact,
  d: BrandDecision | undefined,
  links: Map<string, string[]>,
): ChangeImpactDraft | null {
  const decision = d ?? {
    id: imp.brand_decision_id,
    category: "POSITIONING",
    title: "Unknown decision",
    content: "",
    rationale: null,
  } as BrandDecision;
  const impactType =
    toImpactType(imp.impact_type) ?? toImpactType(decision.category);
  // The column's check constraint only ever stores decision categories, so this
  // is unreachable for real rows; skip rather than invent a value if it ever is
  // not.
  if (!impactType) return null;
  return {
    impact_id: imp.id,
    brand_decision_id: imp.brand_decision_id,
    decision_category: decision.category,
    decision_title: decision.title,
    decision_content: decision.content,
    decision_rationale: decision.rationale,
    decision_supporting_context_ids: links.get(imp.brand_decision_id) ?? [],
    impact_type: impactType,
    severity: imp.severity,
    reason: imp.reason,
    needs_review: true,
    proposed_title: decision.title,
    proposed_content: decision.content,
    proposed_rationale: decision.rationale ?? "Based on existing decision rationale.",
  };
}

/* The reasoning path, stated once and then filled in as it happens. Each step is
   derived from data that already exists: nothing is invented to animate. */
const REASONING_STEPS = [
  "New learning",
  "Impact analysis",
  "Affected decisions",
  "Current vs proposed",
  "Founder approval",
];

function ReasoningPath({
  reached,
  approved,
}: {
  /** How many steps have real content behind them. */
  reached: number;
  approved: boolean;
}) {
  return (
    <ol className="flex flex-wrap items-center gap-x-2 gap-y-1.5 pt-1">
      {REASONING_STEPS.map((step, index) => {
        const done = index < reached;
        const current = index === reached && !approved;
        return (
          <li key={step} className="flex items-center gap-2">
            <span
              className={`inline-flex items-center gap-1.5 text-[0.78rem] ${
                done || current ? "text-foreground" : "text-muted-foreground/60"
              }`}
            >
              <span
                aria-hidden
                className={`h-1.5 w-1.5 rounded-full ${
                  done
                    ? "bg-primary"
                    : current
                      ? "border border-primary bg-primary/25"
                      : "border border-border"
                }`}
              />
              {step}
            </span>
            {index < REASONING_STEPS.length - 1 && (
              <span aria-hidden className="h-px w-4 bg-border" />
            )}
          </li>
        );
      })}
    </ol>
  );
}

export function EvolutionSection({
  startupId,
  initialFacts,
  initialAnalyses,
  initialImpacts,
  activeDecisions,
  approvedContext,
  decisionContextLinks,
}: Props) {
  const [addState, dispatchAdd] = useActionState(addFounderContext, ADD_EMPTY);
  const [analyzeState, dispatchAnalyze] = useActionState(
    runChangeAnalysisFromContext,
    ANALYZE_EMPTY,
  );
  const [text, setText] = useState("");
  const [pendingAnalyzeFactId, setPendingAnalyzeFactId] = useState<
    string | null
  >(null);

  const [initialAddFact] = useState(addState.newFact);
  const [initialAnalyze] = useState(analyzeState.analysis);

  const [facts, setFacts] = useState<FounderFactDraft[]>(() => {
    if (initialAddFact && !initialFacts.some((f) => f.id === initialAddFact.id)) {
      return [initialAddFact, ...initialFacts];
    }
    return initialFacts;
  });
  void initialAddFact;
  const [localAnalyses, setLocalAnalyses] = useState<ChangeAnalysisDraft[]>(
    () => {
      const decisionsById = new Map<string, BrandDecision>();
      for (const d of activeDecisions) decisionsById.set(d.id, d);
      const linksByDecision = new Map<string, string[]>();
      for (const l of decisionContextLinks) {
        const arr = linksByDecision.get(l.decision_id) ?? [];
        arr.push(l.context_item_id);
        linksByDecision.set(l.decision_id, arr);
      }
      const impactsByAnalysis = new Map<string, ChangeAnalysisImpact[]>();
      for (const i of initialImpacts) {
        const arr = impactsByAnalysis.get(i.change_analysis_id) ?? [];
        arr.push(i);
        impactsByAnalysis.set(i.change_analysis_id, arr);
      }
      let analyses: ChangeAnalysisDraft[] = initialAnalyses.map((a) => {
        const impacts = impactsByAnalysis.get(a.id) ?? [];
        const drafts: ChangeImpactDraft[] = impacts
          .map((imp) => {
            const d = decisionsById.get(imp.brand_decision_id);
            return buildImpactDraft(imp, d, linksByDecision);
          })
          .filter((imp): imp is ChangeImpactDraft => imp !== null);
        const src = approvedContext.find(
          (c) => c.id === a.source_context_item_id,
        );
        return {
          id: a.id,
          source_context_id: a.source_context_item_id,
          source_context_content: src?.content ?? "(context removed)",
          summary: a.summary,
          status: a.status,
          created_at: a.created_at,
          impacts: drafts,
          persisted: true,
          persisted_id: a.id,
          reviewed_at: a.reviewed_at,
        };
      });
      if (initialAnalyze && !analyses.some((a) => a.id === initialAnalyze.id)) {
        analyses = [initialAnalyze, ...analyses];
      }
      return analyses;
    },
  );
  void initialAnalyze;

  if (addState.newFact && !facts.some((f) => f.id === addState.newFact!.id)) {
    setFacts((prev) => [addState.newFact!, ...prev]);
    setText("");
  }

  if (analyzeState.analysis && !localAnalyses.some((a) => a.id === analyzeState.analysis!.id)) {
    setLocalAnalyses((prev) => [analyzeState.analysis!, ...prev]);
    setPendingAnalyzeFactId(null);
  }

  const decisionLinksByDecision = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const l of decisionContextLinks) {
      const arr = m.get(l.decision_id) ?? [];
      arr.push(l.context_item_id);
      m.set(l.decision_id, arr);
    }
    return m;
  }, [decisionContextLinks]);

  const contextById = useMemo(() => {
    const m = new Map<string, ContextItem>();
    for (const c of approvedContext) m.set(c.id, c);
    return m;
  }, [approvedContext]);

  const decisionsById = useMemo(() => {
    const m = new Map<string, BrandDecision>();
    for (const d of activeDecisions) m.set(d.id, d);
    return m;
  }, [activeDecisions]);

  const pendingAnalyses = localAnalyses.filter((a) => a.status === "pending");
  const historyAnalyses = localAnalyses.filter(
    (a) => a.status !== "pending",
  );

  return (
    <section className="space-y-16 max-w-3xl">
      <div className="space-y-3">
        <p className="eyebrow">When the startup changes</p>
        <h2 className="display text-[2.1rem] sm:text-[2.5rem] leading-[1.1]">
          We did not regenerate your brand. We found what changed.
        </h2>
        <p className="text-[0.98rem] leading-relaxed text-muted-foreground max-w-xl">
          Add what you learned. We will show which decisions it affects, why, and
          what a targeted revision would look like. You decide whether it happens.
        </p>
        {(pendingAnalyses.length > 0 || historyAnalyses.length > 0) && (
          <p className="text-[0.85rem] text-muted-foreground/80 tabular-nums">
            {pendingAnalyses.length} awaiting your review · {historyAnalyses.length}{" "}
            decided
          </p>
        )}
      </div>

      <div className="space-y-6">
        <form action={dispatchAdd} className="space-y-4">
          <p className="eyebrow">New learning</p>
          <textarea
            name="content"
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={3}
            maxLength={2000}
            placeholder={`For example: "Students are not the only users anymore. We also want professional developers using the platform for client work."`}
            className="field w-full rounded-2xl border border-border/80 bg-card px-4 py-3.5 text-[1rem] leading-relaxed text-foreground placeholder:text-muted-foreground/60 resize-none outline-none"
          />
          <input type="hidden" name="startupId" value={startupId} />
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="text-[0.8rem] text-muted-foreground/80">
              Stored as a Fact, sourced from you
            </span>
            <AddContextButton disabled={!text.trim()} />
          </div>
          {addState.error && (
            <p className="text-[0.9rem] text-destructive pt-1">{addState.error}</p>
          )}
        </form>

        <div className="space-y-4 pt-4">
          <p className="eyebrow">What you have told us since</p>
          {facts.length === 0 ? (
            <p className="text-[0.95rem] text-muted-foreground leading-relaxed">
              Nothing new yet. When the startup learns something that changes the
              brand, it starts here.
            </p>
          ) : (
            <ul className="space-y-6">
              {facts.map((f) => {
                const alreadyAnalyzed = localAnalyses.some(
                  (a) => a.source_context_id === f.id,
                );
                return (
                  <li
                    key={f.id}
                    className="border-l-2 border-border/70 pl-5 sm:pl-6 space-y-3"
                  >
                    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                      <span className="eyebrow">Fact</span>
                      {f.created_at && (
                        <span className="text-[0.75rem] text-muted-foreground/70">
                          {formatTimestamp(f.created_at)}
                        </span>
                      )}
                    </div>
                    <p className="text-[1.02rem] leading-[1.7] text-foreground/90 whitespace-pre-wrap">
                      {f.content}
                    </p>
                    <form action={dispatchAnalyze} className="pt-1">
                      <input
                        type="hidden"
                        name="startupId"
                        value={startupId}
                      />
                      <input
                        type="hidden"
                        name="sourceContextId"
                        value={f.id}
                      />
                      <div className="flex flex-wrap items-center gap-3">
                        <AnalyzeButton
                          disabled={alreadyAnalyzed || pendingAnalyzeFactId === f.id}
                        />
                        {alreadyAnalyzed && (
                          <span className="text-[0.8rem] text-muted-foreground/80">
                            Already analyzed
                          </span>
                        )}
                      </div>
                    </form>
                  </li>
                );
              })}
            </ul>
          )}
          {analyzeState.configError && analyzeState.error && (
            <div className="rounded-2xl border border-border/80 bg-muted/30 p-5 space-y-2">
              <div className="eyebrow">AI not configured</div>
              <p className="text-[0.9rem] text-muted-foreground whitespace-pre-wrap leading-relaxed">
                {analyzeState.error}
              </p>
            </div>
          )}
          {!analyzeState.configError && analyzeState.error && (
            <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-5 text-[0.9rem] text-destructive whitespace-pre-wrap leading-relaxed">
              {analyzeState.error}
            </div>
          )}
        </div>
      </div>

      {(pendingAnalyses.length > 0 || historyAnalyses.length > 0) && (
        <div className="space-y-12">
          <div className="rule" />
          <h3 className="eyebrow">Impact analysis</h3>
          {pendingAnalyses.map((a) => (
            <AnalysisCard
              key={a.id}
              analysis={a}
              startupId={startupId}
              contextById={contextById}
              linksByDecision={decisionLinksByDecision}
              decisionsById={decisionsById}
              allDecisions={activeDecisions}
              onApproved={(persistedId) => {
                setLocalAnalyses((prev) =>
                  prev.map((x) =>
                    x.id === a.id
                      ? {
                          ...x,
                          persisted: true,
                          persisted_id: persistedId ?? x.persisted_id,
                          status: "approved",
                        }
                      : x,
                  ),
                );
              }}
              onStatusChanged={(persistedId, status) => {
                setLocalAnalyses((prev) =>
                  prev.map((x) =>
                    x.id === a.id
                      ? {
                          ...x,
                          persisted: true,
                          persisted_id: persistedId ?? x.persisted_id,
                          status,
                        }
                      : x,
                  ),
                );
              }}
            />
          ))}
          {historyAnalyses.map((a) => (
            <AnalysisCard
              key={a.id}
              analysis={a}
              startupId={startupId}
              contextById={contextById}
              linksByDecision={decisionLinksByDecision}
              decisionsById={decisionsById}
              allDecisions={activeDecisions}
              isHistory
            />
          ))}
        </div>
      )}
    </section>
  );
}

function AnalysisCard({
  analysis,
  startupId,
  contextById,
  linksByDecision,
  decisionsById,
  allDecisions,
  onApproved,
  onStatusChanged,
  isHistory,
}: {
  analysis: ChangeAnalysisDraft;
  startupId: string;
  contextById: Map<string, ContextItem>;
  linksByDecision: Map<string, string[]>;
  decisionsById: Map<string, BrandDecision>;
  allDecisions: BrandDecision[];
  onApproved?: (persistedId: string | null) => void;
  onStatusChanged?: (
    persistedId: string | null,
    status: Exclude<ChangeAnalysisStatus, "pending">,
  ) => void;
  isHistory?: boolean;
}) {
  const [reviewError, setReviewError] = useState<string | null>(null);

  const bindApprove = async (
    s: ReviewState | undefined,
    f: FormData,
  ): Promise<ReviewState> => {
    const res = await approveRevisionForAnalysis(s, f);
    if (res.newStatus === "approved") {
      onApproved?.(res.updatedAnalysisId ?? null);
      setReviewError(null);
    } else if (res.error) {
      setReviewError(res.error);
    }
    return res;
  };

  const bindKeep = async (
    s: ReviewState | undefined,
    f: FormData,
  ): Promise<ReviewState> => {
    const res = await keepCurrentForAnalysis(s, f);
    if (res.newStatus === "ignored") {
      onStatusChanged?.(res.updatedAnalysisId ?? null, "ignored");
      setReviewError(null);
    } else if (res.error) {
      setReviewError(res.error);
    }
    return res;
  };

  const bindReject = async (
    s: ReviewState | undefined,
    f: FormData,
  ): Promise<ReviewState> => {
    const res = await rejectAnalysis(s, f);
    if (res.newStatus === "rejected") {
      onStatusChanged?.(res.updatedAnalysisId ?? null, "rejected");
      setReviewError(null);
    } else if (res.error) {
      setReviewError(res.error);
    }
    return res;
  };

  const [_aState, approveAction] = useActionState(bindApprove, {});
  const [_kState, keepAction] = useActionState(bindKeep, {});
  const [_rState, rejectAction] = useActionState(bindReject, {});
  void _aState;
  void _kState;
  void _rState;

  const isPending = analysis.status === "pending";
  const approved = analysis.status === "approved";

  return (
    /* The analysis is the product's reasoning, so it is allowed to unfold:
       the summary, then each affected decision, then the call to action —
       one sequence, each step waiting for the one before it. */
    <article className="sequence space-y-8">
      <header className="space-y-3">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <span
            className={`eyebrow border border-border/80 rounded-full px-2.5 py-0.5 inline-flex items-center gap-1.5 ${STATUS_TONE[analysis.status]}`}
          >
            {approved && <ConfirmCheck className="h-2.5 w-2.5" />}
            {STATUS_LABEL[analysis.status]}
          </span>
          {analysis.created_at && (
            <span className="text-[0.78rem] text-muted-foreground/70">
              {formatTimestamp(analysis.created_at)}
            </span>
          )}
        </div>
        <h4 className="display text-[1.35rem] sm:text-[1.5rem] leading-snug max-w-2xl">
          {humanize(analysis.summary)}
        </h4>
        <p className="text-[0.9rem] leading-relaxed text-muted-foreground max-w-xl">
          <span className="text-foreground/70">Triggered by:</span>{" "}
          {analysis.source_context_content}
        </p>
        <ReasoningPath
          reached={Math.min(analysis.impacts.length > 0 ? 4 : 2, REASONING_STEPS.length - 1)}
          approved={!isPending}
        />
      </header>

      <ul className="space-y-10 border-l border-border/60 pl-5 sm:pl-8">
        {analysis.impacts.map((imp) => (
          <ImpactItem
            key={imp.impact_id}
            impact={imp}
            isPending={isPending}
            linksByDecision={linksByDecision}
            contextById={contextById}
            decisionsById={decisionsById}
            allDecisions={allDecisions}
            isHistory={isHistory}
          />
        ))}
      </ul>

      {isPending && (
        <footer className="space-y-3 pt-6 border-t border-border/70">
          <div className="eyebrow">Your decision</div>
          <div className="flex items-center gap-3 flex-wrap">
            <form action={approveAction} className="contents">
              <input type="hidden" name="startupId" value={startupId} />
              <input type="hidden" name="analysisId" value={analysis.id} />
              <input
                type="hidden"
                name="sourceContextId"
                value={analysis.source_context_id}
              />
              <input
                type="hidden"
                name="summary"
                value={analysis.summary}
              />
              <input
                type="hidden"
                name="persistedId"
                value={analysis.persisted_id ?? ""}
              />
              <input
                type="hidden"
                name="impacts"
                value={JSON.stringify(analysis.impacts)}
              />
              <ApproveRevisionButton />
            </form>
            <form action={keepAction} className="contents">
              <input type="hidden" name="startupId" value={startupId} />
              <input type="hidden" name="analysisId" value={analysis.id} />
              <input
                type="hidden"
                name="sourceContextId"
                value={analysis.source_context_id}
              />
              <input
                type="hidden"
                name="summary"
                value={analysis.summary}
              />
              <input
                type="hidden"
                name="persistedId"
                value={analysis.persisted_id ?? ""}
              />
              <input
                type="hidden"
                name="impacts"
                value={JSON.stringify(analysis.impacts)}
              />
              <KeepCurrentButton />
            </form>
            <form action={rejectAction} className="contents">
              <input type="hidden" name="startupId" value={startupId} />
              <input type="hidden" name="analysisId" value={analysis.id} />
              <input
                type="hidden"
                name="sourceContextId"
                value={analysis.source_context_id}
              />
              <input
                type="hidden"
                name="summary"
                value={analysis.summary}
              />
              <input
                type="hidden"
                name="persistedId"
                value={analysis.persisted_id ?? ""}
              />
              <input
                type="hidden"
                name="impacts"
                value={JSON.stringify(analysis.impacts)}
              />
              <RejectButton />
            </form>
          </div>
          {reviewError && (
            <p className="text-[0.9rem] text-destructive">{reviewError}</p>
          )}
        </footer>
      )}
    </article>
  );
}

function ImpactItem({
  impact,
  isPending,
  linksByDecision,
  contextById,
  decisionsById,
  allDecisions,
  isHistory,
}: {
  impact: ChangeImpactDraft;
  isPending: boolean;
  linksByDecision: Map<string, string[]>;
  contextById: Map<string, ContextItem>;
  decisionsById: Map<string, BrandDecision>;
  allDecisions: BrandDecision[];
  isHistory?: boolean;
}) {
  const [whyOpen, setWhyOpen] = useState(false);

  const historyChain = useMemo(() => {
    const chain: BrandDecision[] = [];
    const visited = new Set<string>();
    let current: BrandDecision | undefined = decisionsById.get(impact.brand_decision_id);
    while (current && !visited.has(current.id)) {
      visited.add(current.id);
      chain.push(current);
      if (current.supersedes_id) {
        current = allDecisions.find((d) => d.id === current!.supersedes_id);
      } else {
        break;
      }
    }
    return chain;
  }, [impact.brand_decision_id, decisionsById, allDecisions]);

  return (
    <li className="rise relative space-y-5">
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <span className={`eyebrow ${SEVERITY_STYLE[impact.severity]}`}>
            {impact.severity} impact
          </span>
          {impact.drift_type && (
            <span className="eyebrow">{driftLabel(impact.drift_type)}</span>
          )}
          <span className="text-[0.8rem] text-muted-foreground/80">
            {decisionCategoryLabel(impact.decision_category)}
          </span>
        </div>
        <p className="text-[1rem] leading-[1.7] text-foreground/90 whitespace-pre-wrap">
          {humanize(impact.reason)}
        </p>
      </div>

      {historyChain.length > 1 && (
        <div className="space-y-2">
          <button
            type="button"
            onClick={() => setWhyOpen((w) => !w)}
            className="text-[0.82rem] text-muted-foreground hover:text-primary transition-colors underline decoration-border underline-offset-4"
          >
            {whyOpen ? "Hide how this decision evolved" : `How this decision evolved (${historyChain.length} versions)`}
          </button>
          <div className="expand" data-open={whyOpen ? "true" : "false"}>
            <div>
              <ol className="space-y-4 border-l border-border/60 pl-5 pt-4">
                {historyChain.map((d, i) => (
                  <li key={d.id} className="space-y-1.5">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      <span className="eyebrow">
                        {i === 0 ? "Current" : d.status === "active" ? "Active" : "Superseded"}
                      </span>
                      <span className="text-[0.75rem] text-muted-foreground/70">
                        {humanize(d.title)}
                      </span>
                    </div>
                    <p className="text-[0.92rem] leading-relaxed text-muted-foreground whitespace-pre-wrap">
                      {humanize(d.content)}
                    </p>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        </div>
      )}

      <div className="rise space-y-5 border-l-2 border-border/70 pl-5 sm:pl-6">
        <div className="space-y-2">
          <div className="eyebrow">Current</div>
          <h5 className="text-[1.05rem] leading-snug text-foreground">
            {humanize(impact.decision_title)}
          </h5>
          <p className="text-[0.95rem] leading-relaxed text-muted-foreground whitespace-pre-wrap">
            {humanize(impact.decision_content)}
          </p>
          {impact.decision_rationale && (
            <p className="text-[0.88rem] leading-relaxed text-muted-foreground/85 whitespace-pre-wrap pt-1">
              <span className="text-foreground/70">Why:</span>{" "}
              {humanize(impact.decision_rationale)}
            </p>
          )}
          {renderDecisionSupport(
            impact.brand_decision_id,
            linksByDecision,
            contextById,
          )}
        </div>

        <div className="space-y-2 pt-1">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="eyebrow">
              {isPending ? "Proposed" : "Result"}
            </span>
            {!isPending && !isHistory && (
              <span className="text-[0.8rem] text-primary">Now active</span>
            )}
          </div>
          <h5 className="text-[1.05rem] leading-snug text-foreground">
            {humanize(impact.proposed_title || impact.decision_title)}
          </h5>
          <p className="text-[0.95rem] leading-relaxed text-muted-foreground whitespace-pre-wrap">
            {humanize(impact.proposed_content || impact.decision_content)}
          </p>
          {impact.proposed_rationale && (
            <p className="text-[0.88rem] leading-relaxed text-muted-foreground/85 whitespace-pre-wrap pt-1">
              <span className="text-foreground/70">What changed:</span>{" "}
              {humanize(impact.proposed_rationale)}
            </p>
          )}
        </div>
      </div>
    </li>
  );
}

function decisionCategoryLabel(cat: string): string {
  const map: Record<string, string> = {
    AUDIENCE: "Audience",
    POSITIONING: "Positioning",
    VALUE_PROPOSITION: "Value Proposition",
    DIFFERENTIATION: "Differentiation",
    PERSONALITY: "Personality",
    NAMING: "Naming",
    TAGLINE: "Tagline",
    VOICE: "Voice",
    MESSAGING: "Messaging",
    VISUAL_DIRECTION: "Visual Direction",
    LAUNCH: "Launch",
  };
  return map[cat] ?? cat;
}

function renderDecisionSupport(
  decisionId: string,
  linksByDecision: Map<string, string[]>,
  contextById: Map<string, ContextItem>,
) {
  const ids = linksByDecision.get(decisionId) ?? [];
  if (ids.length === 0) return null;
  return (
    <div className="space-y-1.5 pt-1">
      <p className="eyebrow">Supported by</p>
      <ul className="space-y-1">
        {ids.slice(0, 4).map((id) => {
          const ctx = contextById.get(id);
          if (!ctx) return null;
          return (
            <li
              key={id}
              className="text-[0.88rem] leading-relaxed text-muted-foreground/90 flex gap-2"
            >
              <span className="text-muted-foreground/50 shrink-0">—</span>
              <span>{ctx.content}</span>
            </li>
          );
        })}
      </ul>
      {ids.length > 4 && (
        <p className="text-[0.8rem] text-muted-foreground/70">
          +{ids.length - 4} more supporting facts
        </p>
      )}
    </div>
  );
}
