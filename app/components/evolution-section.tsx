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
      className="inline-flex h-9 items-center justify-center rounded-full border border-foreground/30 px-4 text-xs font-medium text-foreground hover:bg-foreground hover:text-background disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
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
      className="inline-flex h-8 items-center justify-center rounded-full border border-foreground bg-foreground px-4 text-xs font-medium text-background hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
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
      className="inline-flex h-8 items-center justify-center rounded-full border border-border bg-transparent px-4 text-xs font-medium text-muted-foreground hover:text-foreground hover:border-muted-foreground disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
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
      className="inline-flex h-8 items-center justify-center rounded-full border border-border bg-transparent px-4 text-xs font-medium text-destructive hover:border-destructive/60 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
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
    <section className="space-y-8">
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
            Evolution
          </h2>
          {(pendingAnalyses.length > 0 || historyAnalyses.length > 0) && (
            <span className="text-xs text-muted-foreground">
              {pendingAnalyses.length} pending · {historyAnalyses.length} decided
            </span>
          )}
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-card text-card-foreground">
        <div className="border-b border-border p-6 sm:p-8 space-y-5">
          <div className="max-w-xl space-y-2">
            <h3 className="text-xl font-semibold leading-tight tracking-tight">
              New information
            </h3>
            <p className="text-sm leading-relaxed text-muted-foreground">
              When the startup changes, add the new fact here. The system will
              compare it against your active brand decisions and flag any that
              may need review — proposing a specific revised wording.
            </p>
          </div>

          <form action={dispatchAdd} className="space-y-3">
            <input type="hidden" name="startupId" value={startupId} />
            <textarea
              name="content"
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={3}
              maxLength={2000}
              placeholder={`For example: "Students are not the only users anymore. We also want professional developers using the platform for client work."`}
              className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-foreground resize-none"
            />
            <div className="flex items-center justify-between">
              <span className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                Stored as FACT · source FOUNDER_INPUT
              </span>
              <AddContextButton disabled={!text.trim()} />
            </div>
            {addState.error && (
              <p className="text-xs text-destructive pt-1">{addState.error}</p>
            )}
          </form>
        </div>

        <div className="p-6 sm:p-8 space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
              Recent founder facts
            </h4>
          </div>
          {facts.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border p-5 text-xs text-muted-foreground leading-relaxed">
              No new founder context yet. Add something above that might
              affect the brand, then analyze its impact.
            </div>
          ) : (
            <ul className="space-y-3">
              {facts.map((f) => {
                const alreadyAnalyzed = localAnalyses.some(
                  (a) => a.source_context_id === f.id,
                );
                return (
                  <li
                    key={f.id}
                    className="rounded-xl border border-border p-4 sm:p-5 space-y-3"
                  >
                    <div className="flex items-start justify-between gap-4 flex-wrap">
                      <div className="flex-1 min-w-0 space-y-1.5">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="inline-flex items-center text-[10px] uppercase tracking-widest font-medium px-2 py-0.5 rounded-full border border-foreground/30 text-foreground">
                            FACT
                          </span>
                          <span className="inline-flex items-center text-[10px] uppercase tracking-widest font-medium px-2 py-0.5 rounded-full border border-border text-muted-foreground">
                            Founder input
                          </span>
                          {f.created_at && (
                            <span className="text-[10px] text-muted-foreground">
                              {new Date(f.created_at).toLocaleString()}
                            </span>
                          )}
                        </div>
                        <p className="text-sm leading-relaxed text-foreground whitespace-pre-wrap">
                          {f.content}
                        </p>
                      </div>
                      <form
                        action={dispatchAnalyze}
                        className="shrink-0 flex flex-col items-end gap-2"
                      >
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
                        <AnalyzeButton
                          disabled={alreadyAnalyzed || pendingAnalyzeFactId === f.id}
                        />
                        {alreadyAnalyzed && (
                          <span className="text-[10px] text-muted-foreground">
                            Already analyzed
                          </span>
                        )}
                      </form>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          {analyzeState.configError && analyzeState.error && (
            <div className="rounded-xl border border-border bg-muted/40 p-5 space-y-2">
              <div className="text-[10px] uppercase tracking-[0.18em] font-medium text-foreground">
                AI not configured
              </div>
              <p className="text-sm text-muted-foreground whitespace-pre-wrap leading-relaxed">
                {analyzeState.error}
              </p>
            </div>
          )}
          {!analyzeState.configError && analyzeState.error && (
            <div className="rounded-xl border border-destructive/40 bg-destructive/5 p-5 text-sm text-destructive whitespace-pre-wrap leading-relaxed">
              {analyzeState.error}
            </div>
          )}
        </div>
      </div>

      {(pendingAnalyses.length > 0 || historyAnalyses.length > 0) && (
        <div className="space-y-8">
          <h3 className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
            Change analyses
          </h3>
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

  return (
    <article className="rounded-2xl border border-border bg-card text-card-foreground overflow-hidden">
      <header className="border-b border-border p-5 sm:p-6 space-y-3 bg-background/40">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex-1 min-w-0 space-y-2">
            <div className="flex items-center gap-2 flex-wrap">
              <span
                className={`inline-flex items-center text-[10px] uppercase tracking-widest font-medium px-2 py-0.5 rounded-full border ${STATUS_TONE[analysis.status]}`}
              >
                {STATUS_LABEL[analysis.status]}
              </span>
              <span className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                Change analysis
              </span>
            </div>
            <h4 className="text-base font-semibold leading-snug tracking-tight text-foreground">
              {humanize(analysis.summary)}
            </h4>
            <div className="text-xs text-muted-foreground space-y-1">
              <div>
                <span className="uppercase tracking-[0.18em] mr-1.5 text-[10px]">
                  Triggered by
                </span>
                {analysis.source_context_content}
              </div>
              {analysis.created_at && (
                <div>{new Date(analysis.created_at).toLocaleString()}</div>
              )}
            </div>
          </div>
        </div>
      </header>

      <ul className="divide-y divide-border">
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
        <footer className="border-t border-border p-5 sm:p-6 space-y-3">
          <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground mb-2">
            Founder decision for this analysis
          </div>
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
            <p className="text-xs text-destructive">{reviewError}</p>
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
    <li className="p-5 sm:p-6 space-y-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <span
            className={`inline-flex items-center text-[10px] uppercase tracking-widest font-medium px-2 py-0.5 rounded-full border ${SEVERITY_STYLE[impact.severity]}`}
          >
            {impact.severity} impact
          </span>
          {impact.drift_type && (
            <span className="inline-flex items-center text-[10px] uppercase tracking-widest font-medium px-2 py-0.5 rounded-full border border-border text-foreground">
              {driftLabel(impact.drift_type)}
            </span>
          )}
          <span className="inline-flex items-center text-[10px] uppercase tracking-widest font-medium px-2 py-0.5 rounded-full border border-foreground/20 text-foreground">
            {decisionCategoryLabel(impact.decision_category)}
          </span>
        </div>
        {historyChain.length > 1 && (
          <button
            type="button"
            onClick={() => setWhyOpen((w) => !w)}
            className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground hover:text-foreground transition-colors"
          >
            {whyOpen ? "Hide history" : `Show history (${historyChain.length})`}
          </button>
        )}
      </div>

      <div>
        <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground mb-1.5">
          Why this may need review
        </div>
        <p className="text-sm leading-relaxed text-foreground whitespace-pre-wrap border-l-2 border-border pl-3">
          {humanize(impact.reason)}
        </p>
      </div>

      {historyChain.length > 1 && whyOpen && (
        <div className="rounded-xl border border-border p-4 sm:p-5 space-y-3 bg-background/30">
          <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
            Decision history
          </div>
          <ol className="space-y-3">
            {historyChain.map((d, i) => (
              <li key={d.id} className="relative pl-6 space-y-1">
                <div className="absolute left-0 top-1.5 flex flex-col items-center">
                  <span className={`w-2 h-2 rounded-full ${i === 0 ? "bg-foreground" : "bg-border"}`} />
                  {i < historyChain.length - 1 && (
                    <span className="w-px h-8 bg-border mt-0.5" />
                  )}
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span
                    className={`inline-flex items-center text-[10px] uppercase tracking-widest font-medium px-2 py-0.5 rounded-full border ${
                      d.status === "active"
                        ? "border-foreground/30 text-foreground"
                        : "border-border text-muted-foreground"
                    }`}
                  >
                    {d.status}
                  </span>
                  {d.supersedes_id && i === 0 && (
                    <span className="text-[10px] uppercase tracking-widest text-muted-foreground">
                      supersedes previous
                    </span>
                  )}
                </div>
                <h5 className="text-sm font-semibold tracking-tight text-foreground">
                  {humanize(d.title)}
                </h5>
                <p className="text-xs leading-relaxed text-muted-foreground whitespace-pre-wrap">
                  {humanize(d.content)}
                </p>
              </li>
            ))}
          </ol>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="rounded-xl border border-border p-4 space-y-2 bg-background/30">
          <div className="flex items-center justify-between">
            <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
              Current decision
            </div>
            <span className="text-[10px] uppercase tracking-widest border border-foreground/30 rounded-full px-2 py-0.5 text-foreground">
              Active
            </span>
          </div>
          <h5 className="text-sm font-semibold text-foreground tracking-tight">
            {humanize(impact.decision_title)}
          </h5>
          <p className="text-xs leading-relaxed text-foreground whitespace-pre-wrap">
            {humanize(impact.decision_content)}
          </p>
          {impact.decision_rationale && (
            <p className="text-[11px] leading-relaxed text-muted-foreground whitespace-pre-wrap border-l-2 border-border pl-2.5 pt-0.5">
              <span className="uppercase tracking-[0.18em] mr-1.5 text-[9px]">
                Why
              </span>
              {humanize(impact.decision_rationale)}
            </p>
          )}
          {renderDecisionSupport(
            impact.brand_decision_id,
            linksByDecision,
            contextById,
          )}
        </div>

        <div className={`rounded-xl border p-4 space-y-2 ${
          isPending
            ? "border-foreground/30 bg-foreground/[0.03]"
            : isHistory
              ? "border-border bg-background/30 opacity-70"
              : "border-emerald-600/30 bg-emerald-500/[0.04] dark:bg-emerald-500/[0.08]"
        }`}>
          <div className="flex items-center justify-between">
            <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
              {isPending ? "Proposed revision" : "Result"}
            </div>
            {!isPending && !isHistory && (
              <span className="text-[10px] uppercase tracking-widest border border-emerald-600/50 text-emerald-700 dark:text-emerald-300 rounded-full px-2 py-0.5">
                New active
              </span>
            )}

          </div>
          <h5 className="text-sm font-semibold text-foreground tracking-tight">
            {humanize(impact.proposed_title || impact.decision_title)}
          </h5>
          <p className="text-xs leading-relaxed text-foreground whitespace-pre-wrap">
            {humanize(impact.proposed_content || impact.decision_content)}
          </p>
          {impact.proposed_rationale && (
            <p className="text-[11px] leading-relaxed text-muted-foreground whitespace-pre-wrap border-l-2 border-border pl-2.5 pt-0.5">
              <span className="uppercase tracking-[0.18em] mr-1.5 text-[9px]">
                Why changed
              </span>
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
    <div className="flex flex-wrap gap-1.5 pt-1">
      <span className="text-[9px] uppercase tracking-[0.18em] text-muted-foreground self-center">
        Supported by
      </span>
      {ids.slice(0, 4).map((id) => {
        const ctx = contextById.get(id);
        if (!ctx) return null;
        const label =
          ctx.content.length > 60
            ? `${ctx.content.slice(0, 60)}…`
            : ctx.content;
        return (
          <span
            key={id}
            title={ctx.content}
            className="inline-flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded-full border border-border text-muted-foreground"
          >
            <span className="inline-flex items-center text-[8px] uppercase tracking-widest font-medium px-1 py-px rounded-full border border-foreground/30 text-foreground">
              {String(ctx.type).slice(0, 4)}
            </span>
            <span className="max-w-[200px] truncate">{label}</span>
          </span>
        );
      })}
      {ids.length > 4 && (
        <span className="text-[9px] text-muted-foreground self-center">
          +{ids.length - 4} more
        </span>
      )}
    </div>
  );
}
