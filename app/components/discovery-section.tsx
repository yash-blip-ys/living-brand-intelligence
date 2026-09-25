"use client";

import { useMemo, useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import {
  runDiscoveryAnalysis,
  approveDiscoveryItem,
  rejectDiscoveryItem,
  type DiscoveryActionState,
  type ProposedContextItemDraft,
  type ReviewActionState,
} from "@/app/actions/discovery";
import type { ContextItem } from "@/lib/types/database";

type Props = {
  startupId: string;
  roughIdea: string;
  hasRawIdea: boolean;
  initialActiveContext: ContextItem[];
  initialRejectedCount: number;
};

type ItemMeta = {
  confidence: number | null;
  source: string | null;
  reasoning: string | null;
};

type LocalActiveItem = {
  id: string;
  type: "FACT" | "INFERENCE" | "HYPOTHESIS";
  content: string;
  meta: ItemMeta;
  created_at: string;
};

function toLocalActive(items: ContextItem[]): LocalActiveItem[] {
  return items.map((c) => {
    const rawMeta =
      c.metadata && typeof c.metadata === "object" && !Array.isArray(c.metadata)
        ? (c.metadata as Record<string, unknown>)
        : null;
    return {
      id: c.id,
      type: c.type as "FACT" | "INFERENCE" | "HYPOTHESIS",
      content: c.content,
      meta: {
        confidence: c.confidence,
        source: c.source,
        reasoning:
          rawMeta && typeof rawMeta.reasoning === "string" ? rawMeta.reasoning : null,
      },
      created_at: c.created_at,
    };
  });
}

function confidenceLabel(c: number | null): string {
  if (c === null) return "";
  return `${Math.round(c * 100)}%`;
}

function TypeBadge({ type }: { type: "FACT" | "INFERENCE" | "HYPOTHESIS" | "DECISION" }) {
  const styles: Record<string, string> = {
    FACT:
      "bg-foreground text-background border-foreground",
    INFERENCE:
      "bg-transparent text-foreground border-border",
    HYPOTHESIS:
      "bg-transparent text-muted-foreground border-border border-dashed",
    DECISION:
      "bg-transparent text-foreground border-border",
  };
  return (
    <span
      className={`inline-flex items-center text-[10px] uppercase tracking-[0.18em] font-medium px-2 py-0.5 rounded-full border ${styles[type] ?? styles.INFERENCE}`}
    >
      {type}
    </span>
  );
}

function ApproveButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex h-8 items-center justify-center rounded-full border border-foreground bg-foreground px-4 text-xs font-medium text-background hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
    >
      {pending ? "Approving…" : "Approve"}
    </button>
  );
}

function RejectButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex h-8 items-center justify-center rounded-full border border-border bg-transparent px-4 text-xs font-medium text-muted-foreground hover:text-foreground hover:border-muted-foreground disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
    >
      {pending ? "Rejecting…" : "Reject"}
    </button>
  );
}

function AnalyzeButton({ disabled }: { disabled?: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={disabled || pending}
      className="inline-flex h-11 items-center justify-center rounded-full bg-primary px-6 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
    >
      {pending ? "Analyzing idea…" : "Analyze my idea"}
    </button>
  );
}

const EMPTY_DISCOVERY_STATE: DiscoveryActionState = {};

function ProposedDiscoveryItem({
  draft,
  startupId,
  roughIdea,
  reviewError,
  makeReviewBinder,
}: {
  draft: ProposedContextItemDraft & { duplicate: boolean };
  startupId: string;
  roughIdea: string;
  reviewError: string | undefined;
  makeReviewBinder: (
    d: ProposedContextItemDraft,
  ) => {
    bindApprove: (
      s: ReviewActionState | undefined,
      f: FormData,
    ) => Promise<ReviewActionState>;
    bindReject: (
      s: ReviewActionState | undefined,
      f: FormData,
    ) => Promise<ReviewActionState>;
  };
}) {
  const binder = makeReviewBinder(draft);
  const [approveState, approveAction] = useFormState(binder.bindApprove, {});
  const [rejectState, rejectAction] = useFormState(binder.bindReject, {});
  void approveState;
  void rejectState;
  const isApproved = draft.state === "approved";
  const isRejected = draft.state === "rejected";
  return (
    <li
      className={`rounded-xl border bg-card text-card-foreground overflow-hidden ${
        isApproved
          ? "border-foreground/30"
          : isRejected
            ? "border-border opacity-60"
            : "border-border"
      }`}
    >
      <div className="p-5 sm:p-6 space-y-3">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-2 flex-wrap">
            <TypeBadge type={draft.type} />
            {draft.confidence !== null && (
              <span className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                Confidence {confidenceLabel(draft.confidence)}
              </span>
            )}
            {draft.duplicate && !isApproved && (
              <span className="text-[10px] uppercase tracking-[0.18em] border border-dashed border-border rounded-full px-2 py-0.5 text-muted-foreground">
                Already active
              </span>
            )}
            {isApproved && (
              <span className="text-[10px] uppercase tracking-[0.18em] border border-foreground/30 rounded-full px-2 py-0.5 text-foreground">
                Approved · active
              </span>
            )}
            {isRejected && (
              <span className="text-[10px] uppercase tracking-[0.18em] border border-border rounded-full px-2 py-0.5 text-muted-foreground">
                Rejected · archived
              </span>
            )}
          </div>
          {draft.source && (
            <span className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground shrink-0">
              {draft.source}
            </span>
          )}
        </div>

        <p className="text-sm leading-relaxed text-foreground whitespace-pre-wrap">
          {draft.content}
        </p>

        {draft.reasoning && (
          <p className="text-xs leading-relaxed text-muted-foreground whitespace-pre-wrap border-l-2 border-border pl-3">
            <span className="uppercase tracking-[0.18em] mr-1.5">Reasoning</span>
            {draft.reasoning}
          </p>
        )}

        {!isApproved && !isRejected && (
          <div className="flex items-center gap-3 pt-2 flex-wrap">
            <form action={approveAction} className="contents">
              <input type="hidden" name="startupId" value={startupId} />
              <input type="hidden" name="tempId" value={draft.tempId} />
              <input type="hidden" name="type" value={draft.type} />
              <input type="hidden" name="content" value={draft.content} />
              <input type="hidden" name="source" value={draft.source ?? ""} />
              <input
                type="hidden"
                name="confidence"
                value={draft.confidence === null ? "" : String(draft.confidence)}
              />
              <input
                type="hidden"
                name="reasoning"
                value={draft.reasoning ?? ""}
              />
              <input type="hidden" name="roughIdea" value={roughIdea} />
              <ApproveButton />
            </form>
            <form action={rejectAction} className="contents">
              <input type="hidden" name="startupId" value={startupId} />
              <input type="hidden" name="tempId" value={draft.tempId} />
              <input type="hidden" name="type" value={draft.type} />
              <input type="hidden" name="content" value={draft.content} />
              <input type="hidden" name="source" value={draft.source ?? ""} />
              <input
                type="hidden"
                name="confidence"
                value={draft.confidence === null ? "" : String(draft.confidence)}
              />
              <input
                type="hidden"
                name="reasoning"
                value={draft.reasoning ?? ""}
              />
              <input type="hidden" name="rejectionReason" value="" />
              <input type="hidden" name="roughIdea" value={roughIdea} />
              <RejectButton />
            </form>
          </div>
        )}

        {reviewError && (
          <p className="text-xs text-destructive pt-1">{reviewError}</p>
        )}
      </div>
    </li>
  );
}

export function DiscoverySection({
  startupId,
  roughIdea,
  hasRawIdea,
  initialActiveContext,
  initialRejectedCount,
}: Props) {
  const [discoveryState, dispatchDiscovery] = useFormState(
    runDiscoveryAnalysis,
    EMPTY_DISCOVERY_STATE,
  );

  const [initialDiscoveryProposed] = useState<
    ProposedContextItemDraft[] | null | undefined
  >(discoveryState.proposed);
  const [proposed, setProposed] = useState<ProposedContextItemDraft[] | null>(
    initialDiscoveryProposed ?? null,
  );
  if (discoveryState.proposed && proposed === null) {
    setProposed(discoveryState.proposed);
  }
  const [activeItems, setActiveItems] = useState<LocalActiveItem[]>(() =>
    toLocalActive(initialActiveContext),
  );
  const [rejectedCount, setRejectedCount] = useState(initialRejectedCount);
  const [reviewErrors, setReviewErrors] = useState<Record<string, string>>({});

  const activeContentSet = useMemo(
    () => new Set(activeItems.map((a) => a.content.trim().toLowerCase())),
    [activeItems],
  );

  const groupedProposed = useMemo(() => {
    const groups: Record<
      "FACT" | "INFERENCE" | "HYPOTHESIS",
      Array<ProposedContextItemDraft & { duplicate: boolean }>
    > = {
      FACT: [],
      INFERENCE: [],
      HYPOTHESIS: [],
    };
    for (const p of proposed ?? []) {
      const duplicate = activeContentSet.has(p.content.trim().toLowerCase());
      groups[p.type].push({ ...p, duplicate });
    }
    return groups;
  }, [proposed, activeContentSet]);

  const groupedActive = useMemo(() => {
    const groups: Record<
      "FACT" | "INFERENCE" | "HYPOTHESIS",
      LocalActiveItem[]
    > = {
      FACT: [],
      INFERENCE: [],
      HYPOTHESIS: [],
    };
    for (const a of activeItems) {
      groups[a.type].push(a);
    }
    return groups;
  }, [activeItems]);

  const handleApproveDone = (tempId: string, id: string, draft: ProposedContextItemDraft) => {
    setProposed((prev) =>
      prev
        ? prev.map((d) =>
            d.tempId === tempId
              ? { ...d, state: "approved", persisted: true, persistedId: id }
              : d,
          )
        : prev,
    );
    setActiveItems((prev) => {
      const already = prev.some((a) => a.id === id);
      if (already) return prev;
      const item: LocalActiveItem = {
        id,
        type: draft.type,
        content: draft.content,
        meta: {
          confidence: draft.confidence,
          source: draft.source,
          reasoning: draft.reasoning,
        },
        created_at: new Date().toISOString(),
      };
      return [...prev, item];
    });
    setReviewErrors((prev) => {
      if (!prev[tempId]) return prev;
      const copy = { ...prev };
      delete copy[tempId];
      return copy;
    });
  };

  const handleRejectDone = (tempId: string) => {
    setProposed((prev) =>
      prev
        ? prev.map((d) =>
            d.tempId === tempId ? { ...d, state: "rejected" } : d,
          )
        : prev,
    );
    setRejectedCount((c) => c + 1);
    setReviewErrors((prev) => {
      if (!prev[tempId]) return prev;
      const copy = { ...prev };
      delete copy[tempId];
      return copy;
    });
  };

  const makeReviewBinder = (
    draft: ProposedContextItemDraft,
  ): {
    bindApprove: (s: ReviewActionState | undefined, f: FormData) => Promise<ReviewActionState>;
    bindReject: (s: ReviewActionState | undefined, f: FormData) => Promise<ReviewActionState>;
  } => {
    const bindApprove = async (
      _state: ReviewActionState | undefined,
      formData: FormData,
    ): Promise<ReviewActionState> => {
      const res = await approveDiscoveryItem(_state, formData);
      if (res.updatedTempId === draft.tempId && res.updatedId && res.newState === "approved") {
        handleApproveDone(draft.tempId, res.updatedId, draft);
      } else if (res.error && res.updatedTempId) {
        setReviewErrors((prev) => ({ ...prev, [res.updatedTempId!]: res.error! }));
      } else if (res.error) {
        setReviewErrors((prev) => ({ ...prev, [draft.tempId]: res.error! }));
      }
      return res;
    };
    const bindReject = async (
      _state: ReviewActionState | undefined,
      formData: FormData,
    ): Promise<ReviewActionState> => {
      const res = await rejectDiscoveryItem(_state, formData);
      if (res.updatedTempId === draft.tempId && res.newState === "rejected") {
        handleRejectDone(draft.tempId);
      } else if (res.error && res.updatedTempId) {
        setReviewErrors((prev) => ({ ...prev, [res.updatedTempId!]: res.error! }));
      } else if (res.error) {
        setReviewErrors((prev) => ({ ...prev, [draft.tempId]: res.error! }));
      }
      return res;
    };
    return { bindApprove, bindReject };
  };

  const totalProposedCount =
    groupedProposed.FACT.length + groupedProposed.INFERENCE.length + groupedProposed.HYPOTHESIS.length;

  const proposedPendingCount =
    proposed?.filter((p) => p.state === "proposed").length ?? 0;

  const hasAnyProposedToShow = totalProposedCount > 0;
  const hasAnyActive =
    groupedActive.FACT.length + groupedActive.INFERENCE.length + groupedActive.HYPOTHESIS.length > 0;

  return (
    <section className="space-y-8">
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
            Discovery
          </h2>
          {hasAnyActive && (
            <span className="text-xs text-muted-foreground">
              {activeItems.length} active · {rejectedCount} rejected
            </span>
          )}
        </div>

        <div className="rounded-2xl border border-border bg-card text-card-foreground">
          {hasRawIdea && (
            <div className="border-b border-border p-6 sm:p-8">
              <h3 className="text-xs uppercase tracking-[0.18em] text-muted-foreground mb-3">
                Your rough idea
              </h3>
              <p className="whitespace-pre-wrap leading-relaxed text-foreground">
                {roughIdea}
              </p>
            </div>
          )}

          <div className="p-6 sm:p-8 space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
              <div className="max-w-xl">
                <h3 className="text-xl font-semibold leading-tight tracking-tight mb-2">
                  Understand what you&apos;re building
                </h3>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  Before making brand decisions, let the system analyze the idea
                  and propose structured context. You review each item —
                  approve what is true, reject what is not.
                </p>
              </div>
              <form action={dispatchDiscovery} className="shrink-0">
                <input type="hidden" name="startupId" value={startupId} />
                <AnalyzeButton disabled={!hasRawIdea} />
              </form>
            </div>

            {discoveryState.configError && discoveryState.error && (
              <div className="rounded-xl border border-border bg-muted/40 p-5 space-y-2">
                <div className="text-[11px] uppercase tracking-[0.18em] font-medium text-foreground">
                  AI not configured
                </div>
                <p className="text-sm text-muted-foreground whitespace-pre-wrap leading-relaxed">
                  {discoveryState.error}
                </p>
              </div>
            )}

            {!discoveryState.configError && discoveryState.error && (
              <div className="rounded-xl border border-destructive/40 bg-destructive/5 p-5 text-sm text-destructive whitespace-pre-wrap leading-relaxed">
                {discoveryState.error}
              </div>
            )}

            {discoveryState.analyzing === true && !hasAnyProposedToShow && (
              <div className="rounded-xl border border-border p-5 text-sm text-muted-foreground">
                Analyzing the idea…
              </div>
            )}
          </div>
        </div>
      </div>

      {hasAnyProposedToShow && (
        <div className="space-y-6">
          <div className="flex items-end justify-between">
            <div>
              <h3 className="text-xs uppercase tracking-[0.18em] text-muted-foreground mb-2">
                Proposed for review
              </h3>
              <p className="text-sm text-muted-foreground">
                {proposedPendingCount > 0
                  ? `${proposedPendingCount} item${proposedPendingCount === 1 ? "" : "s"} awaiting your review.`
                  : "All items have been reviewed."}
              </p>
            </div>
          </div>

          {(["FACT", "INFERENCE", "HYPOTHESIS"] as const).map((bucket) => {
            const items = groupedProposed[bucket];
            if (items.length === 0) return null;
            return (
              <div key={bucket} className="space-y-3">
                <div className="flex items-center gap-2">
                  <TypeBadge type={bucket} />
                  <span className="text-xs text-muted-foreground">
                    {items.length}
                  </span>
                </div>
                <ul className="space-y-3">
                  {items.map((draft) => {
                    const reviewError = reviewErrors[draft.tempId];
                    return (
                      <ProposedDiscoveryItem
                        key={draft.tempId}
                        draft={draft}
                        startupId={startupId}
                        roughIdea={roughIdea}
                        reviewError={reviewError}
                        makeReviewBinder={makeReviewBinder}
                      />
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </div>
      )}

      {hasAnyActive && (
        <div className="space-y-6">
          <div>
            <h3 className="text-xs uppercase tracking-[0.18em] text-muted-foreground mb-2">
              Active startup context
            </h3>
            <p className="text-sm text-muted-foreground">
              Approved Facts, Inferences, and Hypotheses about this startup.
            </p>
          </div>

          {(["FACT", "INFERENCE", "HYPOTHESIS"] as const).map((bucket) => {
            const items = groupedActive[bucket];
            if (items.length === 0) return null;
            return (
              <div key={bucket} className="space-y-3">
                <div className="flex items-center gap-2">
                  <TypeBadge type={bucket} />
                  <span className="text-xs text-muted-foreground">{items.length}</span>
                </div>
                <ul className="space-y-3">
                  {items.map((item) => (
                    <li
                      key={item.id}
                      className="rounded-xl border border-border bg-card text-card-foreground overflow-hidden"
                    >
                      <div className="p-5 sm:p-6 space-y-3">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex items-center gap-2">
                            <TypeBadge type={item.type} />
                            {item.meta.confidence !== null && (
                              <span className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                                Confidence {confidenceLabel(item.meta.confidence)}
                              </span>
                            )}
                          </div>
                          {item.meta.source && (
                            <span className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground shrink-0">
                              {item.meta.source}
                            </span>
                          )}
                        </div>
                        <p className="text-sm leading-relaxed text-foreground whitespace-pre-wrap">
                          {item.content}
                        </p>
                        {item.meta.reasoning && (
                          <p className="text-xs leading-relaxed text-muted-foreground whitespace-pre-wrap border-l-2 border-border pl-3">
                            <span className="uppercase tracking-[0.18em] mr-1.5">
                              Reasoning
                            </span>
                            {item.meta.reasoning}
                          </p>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
