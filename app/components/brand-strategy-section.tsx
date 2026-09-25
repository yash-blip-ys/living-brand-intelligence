"use client";

import { useMemo, useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import type { BrandDecision, BrandDecisionCategory, ContextItem } from "@/lib/types/database";
import type { DecisionContextSupport } from "@/lib/db/brand-decisions";
import {
  runStrategyGeneration,
  approveStrategyDecision,
  rejectStrategyDecision,
  type StrategyActionState,
  type ProposedDecisionDraft,
  type DecisionReviewState,
} from "@/app/actions/strategy";

type Props = {
  startupId: string;
  roughIdea: string;
  approvedContext: ContextItem[];
  initialDecisions: BrandDecision[];
  initialLinks: DecisionContextSupport[];
  initialRejectedCount: number;
};

type LocalActiveDecision = {
  id: string;
  category: BrandDecisionCategory;
  title: string;
  content: string;
  rationale: string | null;
  supporting_context_ids: string[];
  created_at: string;
  supersedes_id: string | null;
  status: "active" | "superseded";
};

const CATEGORY_LABEL: Record<BrandDecisionCategory, string> = {
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

const CATEGORY_GROUPS: Array<{
  key: string;
  label: string;
  description: string;
  categories: BrandDecisionCategory[];
}> = [
  {
    key: "foundation",
    label: "Foundation",
    description: "Who you serve, where you stand, and why you win.",
    categories: ["AUDIENCE", "POSITIONING", "VALUE_PROPOSITION", "DIFFERENTIATION"],
  },
  {
    key: "expression",
    label: "Expression",
    description: "Personality, voice, and messaging direction.",
    categories: ["PERSONALITY", "VOICE", "MESSAGING"],
  },
  {
    key: "identity",
    label: "Identity",
    description: "Name, tagline, and visual direction.",
    categories: ["NAMING", "TAGLINE", "VISUAL_DIRECTION"],
  },
  {
    key: "gtm",
    label: "Go-to-market",
    description: "Launch strategy and initial market motion.",
    categories: ["LAUNCH"],
  },
];

function toLocalActive(
  decisions: BrandDecision[],
  links: DecisionContextSupport[],
): LocalActiveDecision[] {
  const byDecision = new Map<string, string[]>();
  for (const l of links) {
    const arr = byDecision.get(l.decision_id) ?? [];
    arr.push(l.context_item_id);
    byDecision.set(l.decision_id, arr);
  }
  return decisions
    .filter((d) => d.status === "active" || d.status === "superseded")
    .map((d) => ({
      id: d.id,
      category: d.category,
      title: d.title,
      content: d.content,
      rationale: d.rationale,
      supporting_context_ids: byDecision.get(d.id) ?? [],
      created_at: d.created_at,
      supersedes_id: d.supersedes_id,
      status: d.status as "active" | "superseded",
    }));
}

function TypeBadge({ type }: { type: "FACT" | "INFERENCE" | "HYPOTHESIS" }) {
  const styles: Record<string, string> = {
    FACT: "bg-foreground text-background border-foreground",
    INFERENCE: "bg-transparent text-foreground border-border",
    HYPOTHESIS:
      "bg-transparent text-muted-foreground border-border border-dashed",
  };
  return (
    <span
      className={`inline-flex items-center text-[9px] uppercase tracking-widest font-medium px-1.5 py-0.5 rounded-full border ${styles[type]}`}
    >
      {type}
    </span>
  );
}

function CategoryBadge({
  category,
  tone,
}: {
  category: BrandDecisionCategory;
  tone?: "default" | "muted";
}) {
  return (
    <span
      className={`inline-flex items-center text-[9px] uppercase tracking-[0.18em] font-medium px-2 py-0.5 rounded-full border ${
        tone === "muted"
          ? "border-border text-muted-foreground"
          : "border-foreground/30 text-foreground"
      }`}
    >
      {CATEGORY_LABEL[category]}
    </span>
  );
}

type StructuredSections = Record<string, string>;

function parseSections(content: string): StructuredSections {
  const trimmed = content.trim();
  if (!trimmed.startsWith("### ")) {
    return { "": trimmed };
  }
  const parts = trimmed.split(/(?:^|\n)###\s+/);
  const out: StructuredSections = {};
  for (const p of parts) {
    if (!p.trim()) continue;
    const nl = p.indexOf("\n");
    if (nl === -1) {
      out[p.trim()] = "";
    } else {
      const key = p.slice(0, nl).trim();
      const val = p.slice(nl + 1).trim();
      out[key] = val;
    }
  }
  return out;
}

const MULTI_SECTION_CATEGORIES: BrandDecisionCategory[] = [
  "PERSONALITY",
  "NAMING",
  "TAGLINE",
  "VOICE",
  "MESSAGING",
  "VISUAL_DIRECTION",
  "LAUNCH",
];

function RenderStructuredContent({
  content,
  category,
}: {
  content: string;
  category: BrandDecisionCategory;
}) {
  const multi = MULTI_SECTION_CATEGORIES.includes(category);
  if (!multi) {
    return (
      <p className="text-sm leading-relaxed text-foreground whitespace-pre-wrap">
        {content}
      </p>
    );
  }
  const sections = parseSections(content);
  const keys = Object.keys(sections);
  if (keys.length === 1 && keys[0] === "") {
    return (
      <p className="text-sm leading-relaxed text-foreground whitespace-pre-wrap">
        {sections[""]}
      </p>
    );
  }
  return (
    <div className="space-y-4">
      {Object.entries(sections).map(([k, v]) => {
        if (!v.trim() && k) {
          return (
            <p key={k} className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
              {k}
            </p>
          );
        }
        const bullets =
          k.toLowerCase().includes("do") ||
          k.toLowerCase().includes("don") ||
          k.toLowerCase().includes("principle") ||
          k.toLowerCase().includes("avoid") ||
          k.toLowerCase().includes("trait") ||
          k.toLowerCase().includes("risk") ||
          k.toLowerCase().includes("direction") ||
          k.toLowerCase().includes("proof") ||
          k.toLowerCase().includes("supporting");
        return (
          <div key={k || "content"}>
            {k && (
              <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground mb-1.5">
                {k}
              </p>
            )}
            {bullets ? (
              <ul className="space-y-1">
                {v.split("\n").map((line, idx) => {
                  const t = line.trim();
                  if (!t) return null;
                  const clean = t.replace(/^(-\s*|\d+\.\s*|\*\s*)/, "");
                  if (!clean.trim()) return null;
                  return (
                    <li
                      key={idx}
                      className="text-sm leading-relaxed text-foreground/90 pl-4 relative"
                    >
                      <span className="absolute left-0 text-foreground/30">·</span>
                      {clean}
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="text-sm leading-relaxed text-foreground whitespace-pre-wrap">
                {v}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}

const WORKFLOW_STAGES = [
  { key: "analyst", label: "Discovery Analyst", desc: "Facts · Inferences · Hypotheses" },
  { key: "position", label: "Positioning Strategist", desc: "Audience · Positioning · Value · Differentiation" },
  { key: "shaper", label: "Brand Shaper", desc: "Personality · Naming · Tagline · Voice · Messaging" },
  { key: "visual", label: "Visual Strategist", desc: "Logo · Typography · Color · Shape · Imagery · Composition" },
  { key: "critic", label: "Brand Critic", desc: "Clichés · Weak claims · Bias · Vague positioning" },
  { key: "guardian", label: "Consistency Guardian", desc: "9 cross-check pairs · PASS / NEEDS REVIEW / CONFLICT" },
  { key: "launch", label: "Launch Strategist", desc: "Headline · Sub · CTA · Description · Social copy" },
];

function GenerateButton({ disabled }: { disabled?: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={disabled || pending}
      className="inline-flex h-11 items-center justify-center rounded-full bg-primary px-6 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
    >
      {pending ? "Generating strategy…" : "Generate brand strategy"}
    </button>
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

const EMPTY_STATE: StrategyActionState = {};

export function BrandStrategySection({
  startupId,
  roughIdea,
  approvedContext,
  initialDecisions,
  initialLinks,
  initialRejectedCount,
}: Props) {
  const [genState, dispatchGen] = useFormState(
    runStrategyGeneration,
    EMPTY_STATE,
  );

  const [initialProposedSeed] = useState<
    ProposedDecisionDraft[] | null | undefined
  >(genState.proposed);
  const [proposed, setProposed] = useState<ProposedDecisionDraft[] | null>(
    initialProposedSeed ?? null,
  );
  if (genState.proposed && proposed === null) {
    setProposed(genState.proposed);
  }
  const [activeDecisions, setActiveDecisions] = useState<LocalActiveDecision[]>(
    () => toLocalActive(initialDecisions, initialLinks),
  );
  const [rejectedCount, setRejectedCount] = useState(initialRejectedCount);
  const [reviewErrors, setReviewErrors] = useState<Record<string, string>>({});

  const approvedByType = useMemo(() => {
    const groups: Record<
      "FACT" | "INFERENCE" | "HYPOTHESIS",
      ContextItem[]
    > = { FACT: [], INFERENCE: [], HYPOTHESIS: [] };
    for (const c of approvedContext) {
      const type = c.type as "FACT" | "INFERENCE" | "HYPOTHESIS";
      if (groups[type]) groups[type].push(c);
    }
    return groups;
  }, [approvedContext]);

  const contextById = useMemo(() => {
    const m = new Map<string, ContextItem>();
    for (const c of approvedContext) m.set(c.id, c);
    return m;
  }, [approvedContext]);

  const activeByCategory = useMemo(() => {
    const groups = new Map<BrandDecisionCategory, LocalActiveDecision[]>();
    for (const d of activeDecisions.filter((d) => d.status === "active")) {
      const arr = groups.get(d.category) ?? [];
      arr.push(d);
      groups.set(d.category, arr);
    }
    return groups;
  }, [activeDecisions]);

  const proposedByCategory = useMemo(() => {
    const groups = new Map<BrandDecisionCategory, ProposedDecisionDraft[]>();
    if (!proposed) return groups;
    for (const p of proposed) {
      if (p.state !== "proposed") continue;
      const arr = groups.get(p.category) ?? [];
      arr.push(p);
      groups.set(p.category, arr);
    }
    return groups;
  }, [proposed]);

  const proposedPending = proposed?.filter((d) => d.state === "proposed").length ?? 0;

  const handleApproved = (tempId: string, id: string, draft: ProposedDecisionDraft) => {
    setProposed((prev) =>
      prev
        ? prev.map((d) =>
            d.tempId === tempId
              ? { ...d, state: "approved", persisted: true, persistedId: id }
              : d,
          )
        : prev,
    );
    setActiveDecisions((prev) => {
      if (prev.some((a) => a.id === id)) return prev;
      return [
        ...prev,
        {
          id,
          category: draft.category,
          title: draft.title,
          content: draft.content,
          rationale: draft.rationale,
          supporting_context_ids: [...draft.supporting_context_ids],
          created_at: new Date().toISOString(),
          supersedes_id: null,
          status: "active",
        },
      ];
    });
    setReviewErrors((prev) => {
      if (!prev[tempId]) return prev;
      const copy = { ...prev };
      delete copy[tempId];
      return copy;
    });
  };

  const handleRejected = (tempId: string) => {
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

  const makeReviewBind = (draft: ProposedDecisionDraft) => ({
    bindApprove: async (
      s: DecisionReviewState | undefined,
      f: FormData,
    ): Promise<DecisionReviewState> => {
      const res = await approveStrategyDecision(s, f);
      if (
        res.updatedTempId === draft.tempId &&
        res.updatedId &&
        res.newState === "approved"
      ) {
        handleApproved(draft.tempId, res.updatedId, draft);
      } else if (res.error) {
        const key = res.updatedTempId ?? draft.tempId;
        setReviewErrors((prev) => ({ ...prev, [key]: res.error! }));
      }
      return res;
    },
    bindReject: async (
      s: DecisionReviewState | undefined,
      f: FormData,
    ): Promise<DecisionReviewState> => {
      const res = await rejectStrategyDecision(s, f);
      if (
        res.updatedTempId === draft.tempId &&
        res.newState === "rejected"
      ) {
        handleRejected(draft.tempId);
      } else if (res.error) {
        const key = res.updatedTempId ?? draft.tempId;
        setReviewErrors((prev) => ({ ...prev, [key]: res.error! }));
      }
      return res;
    },
  });

  const renderSupportingChips = (ids: string[]) => {
    if (ids.length === 0) return null;
    return (
      <div className="flex flex-wrap gap-1.5">
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
              <TypeBadge
                type={
                  (ctx.type === "FACT" ||
                    ctx.type === "INFERENCE" ||
                    ctx.type === "HYPOTHESIS"
                    ? ctx.type
                    : "FACT") as
                    | "FACT"
                    | "INFERENCE"
                    | "HYPOTHESIS"
                }
              />
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
  };

  const allActiveCount = activeDecisions.filter((d) => d.status === "active").length;

  return (
    <section className="space-y-8">
      <div className="flex items-center justify-between">
        <h2 className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
          Brand strategy
        </h2>
        {allActiveCount > 0 && (
          <span className="text-xs text-muted-foreground">
            {allActiveCount} active · {rejectedCount} rejected
          </span>
        )}
      </div>

      <div className="rounded-2xl border border-border bg-card text-card-foreground">
        <div className="border-b border-border p-5 sm:p-6 space-y-3">
          <div className="flex items-baseline justify-between gap-4 flex-wrap">
            <div>
              <h3 className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                AI workflow · How this is reasoned
              </h3>
              <p className="text-sm text-muted-foreground mt-2 max-w-2xl">
                7 specialized stages. Every stage receives structured output from the
                previous stage — no raw-idea restarts.
              </p>
            </div>
            <span className="text-[10px] uppercase tracking-[0.18em] text-foreground/40 border border-foreground/20 rounded-full px-2.5 py-1">
              7 stages
            </span>
          </div>
          <ol className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 pt-2">
            {WORKFLOW_STAGES.map((stage, idx) => (
              <li
                key={stage.key}
                className="rounded-xl border border-border bg-background/60 p-4 space-y-1"
              >
                <div className="flex items-center justify-between">
                  <span className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                    0{idx + 1}
                  </span>
                  <span
                    aria-hidden className="text-muted-foreground/40 text-xs"
                  >
                    →
                  </span>
                </div>
                <p className="text-sm font-semibold tracking-tight text-foreground">
                  {stage.label}
                </p>
                <p className="text-[11px] leading-relaxed text-muted-foreground">
                  {stage.desc}
                </p>
              </li>
            ))}
          </ol>
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-card text-card-foreground">
        <div className="border-b border-border p-6 sm:p-8 space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
            <div className="max-w-xl space-y-2">
              <h3 className="text-xl font-semibold leading-tight tracking-tight">
                Approved startup context
              </h3>
              <p className="text-sm leading-relaxed text-muted-foreground">
                Brand strategy is generated from the Facts, Inferences, and
                Hypotheses you approved in Discovery. Every decision is
                grounded in this context.
              </p>
            </div>
            <form action={dispatchGen} className="shrink-0">
              <input type="hidden" name="startupId" value={startupId} />
              <GenerateButton disabled={approvedContext.length === 0 || !roughIdea} />
            </form>
          </div>

          {approvedContext.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border p-5 text-sm text-muted-foreground leading-relaxed">
              No approved context yet. Approve at least one item in Discovery
              above, then generate strategy.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {(["FACT", "INFERENCE", "HYPOTHESIS"] as const).map((t) => {
                const items = approvedByType[t];
                return (
                  <div key={t} className="space-y-2">
                    <div className="flex items-center gap-2">
                      <TypeBadge type={t} />
                      <span className="text-xs text-muted-foreground">
                        {items.length}
                      </span>
                    </div>
                    <ul className="space-y-2">
                      {items.length === 0 ? (
                        <li className="text-xs text-muted-foreground italic">
                          None yet.
                        </li>
                      ) : (
                        items.slice(0, 3).map((c) => (
                          <li
                            key={c.id}
                            className="rounded-lg border border-border p-3 text-xs leading-relaxed text-foreground"
                            title={c.content}
                          >
                            {c.content.length > 140
                              ? `${c.content.slice(0, 140)}…`
                              : c.content}
                          </li>
                        ))
                      )}
                    </ul>
                  </div>
                );
              })}
            </div>
          )}

          {genState.configError && genState.error && (
            <div className="rounded-xl border border-border bg-muted/40 p-5 space-y-2">
              <div className="text-[10px] uppercase tracking-[0.18em] font-medium text-foreground">
                AI not configured
              </div>
              <p className="text-sm text-muted-foreground whitespace-pre-wrap leading-relaxed">
                {genState.error}
              </p>
            </div>
          )}
          {!genState.configError && genState.error && (
            <div className="rounded-xl border border-destructive/40 bg-destructive/5 p-5 text-sm text-destructive whitespace-pre-wrap leading-relaxed">
              {genState.error}
            </div>
          )}
        </div>
      </div>

      {proposedPending > 0 && (
        <div className="space-y-6">
          <div>
            <h3 className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground mb-2">
              Proposed for review
            </h3>
            <p className="text-sm text-muted-foreground">
              {proposedPending} decision
              {proposedPending === 1 ? "" : "s"} awaiting your review.
            </p>
          </div>
          <div className="space-y-5">
            {CATEGORY_GROUPS.map((group) => {
              const groupItems = group.categories
                .map((cat) => ({
                  cat,
                  items: proposedByCategory.get(cat) ?? [],
                }))
                .filter(({ items }) => items.length > 0);
              if (groupItems.length === 0) return null;
              return (
                <div key={group.key} className="space-y-3">
                  <div className="flex items-baseline gap-3">
                    <h4 className="text-[11px] uppercase tracking-[0.18em] font-semibold text-foreground">
                      {group.label}
                    </h4>
                    <span className="text-[10px] text-muted-foreground">
                      {group.description}
                    </span>
                  </div>
                  <div className="space-y-3">
                    {groupItems.flatMap(({ cat, items }) =>
                      items.map((draft) => {
                        const reviewError = reviewErrors[draft.tempId];
                        return (
                          <ProposedDecisionItem
                            key={draft.tempId}
                            draft={draft}
                            startupId={startupId}
                            cat={cat}
                            reviewError={reviewError}
                            makeReviewBind={makeReviewBind}
                            renderSupportingChips={renderSupportingChips}
                          />
                        );
                      }),
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {allActiveCount > 0 && (
        <div className="space-y-6">
          <div>
            <h3 className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground mb-2">
              Active brand decisions
            </h3>
            <p className="text-sm text-muted-foreground">
              Founder-approved brand system. Every decision is traceable to
              the context that supports it.
            </p>
          </div>
          <div className="space-y-6">
            {CATEGORY_GROUPS.map((group) => {
              const groupItems = group.categories
                .map((cat) => ({
                  cat,
                  items: activeByCategory.get(cat) ?? [],
                }))
                .filter(({ items }) => items.length > 0);
              if (groupItems.length === 0) return null;
              return (
                <div key={group.key} className="space-y-3">
                  <div className="flex items-baseline gap-3 border-b border-border pb-2">
                    <h4 className="text-[11px] uppercase tracking-[0.18em] font-semibold text-foreground">
                      {group.label}
                    </h4>
                    <span className="text-[10px] text-muted-foreground">
                      {group.description}
                    </span>
                  </div>
                  <div className="space-y-3">
                    {groupItems.flatMap(({ cat, items }) =>
                      items.map((d) => (
                        <ActiveDecisionCard
                          key={d.id}
                          decision={d}
                          cat={cat}
                          renderSupportingChips={renderSupportingChips}
                        />
                      )),
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}

function ProposedDecisionItem({
  draft,
  startupId,
  cat,
  reviewError,
  makeReviewBind,
  renderSupportingChips,
}: {
  draft: ProposedDecisionDraft;
  startupId: string;
  cat: BrandDecisionCategory;
  reviewError: string | undefined;
  makeReviewBind: (
    d: ProposedDecisionDraft,
  ) => {
    bindApprove: (
      s: DecisionReviewState | undefined,
      f: FormData,
    ) => Promise<DecisionReviewState>;
    bindReject: (
      s: DecisionReviewState | undefined,
      f: FormData,
    ) => Promise<DecisionReviewState>;
  };
  renderSupportingChips: (ids: string[]) => React.ReactNode;
}) {
  const binders = makeReviewBind(draft);
  const [_aState, approveAction] = useFormState(binders.bindApprove, {});
  const [_rState, rejectAction] = useFormState(binders.bindReject, {});
  void _aState;
  void _rState;
  return (
    <ProposedCard
      draft={draft}
      startupId={startupId}
      cat={cat}
      approveAction={approveAction}
      rejectAction={rejectAction}
      renderSupportingChips={renderSupportingChips}
      reviewError={reviewError}
    />
  );
}

function ProposedCard({
  draft,
  startupId,
  cat,
  approveAction,
  rejectAction,
  renderSupportingChips,
  reviewError,
}: {
  draft: ProposedDecisionDraft;
  startupId: string;
  cat: BrandDecisionCategory;
  approveAction: (payload: FormData) => void;
  rejectAction: (payload: FormData) => void;
  renderSupportingChips: (ids: string[]) => React.ReactNode;
  reviewError: string | undefined;
}) {
  void cat;
  return (
    <div className="rounded-xl border border-border bg-card text-card-foreground overflow-hidden">
      <div className="p-5 sm:p-6 space-y-4">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-2 flex-wrap">
            <CategoryBadge category={draft.category} />
            <h4 className="text-sm font-semibold leading-snug text-foreground">
              {draft.title}
            </h4>
          </div>
        </div>
        <RenderStructuredContent
          content={draft.content}
          category={draft.category}
        />
        {draft.rationale && (
          <p className="text-xs leading-relaxed text-muted-foreground whitespace-pre-wrap border-l-2 border-border pl-3">
            <span className="uppercase tracking-[0.18em] mr-1.5 text-[9px]">
              Why
            </span>
            {draft.rationale}
          </p>
        )}
        {draft.uncertainty && (
          <p className="text-xs leading-relaxed text-muted-foreground border-l-2 border-dashed border-border pl-3">
            <span className="uppercase tracking-[0.18em] mr-1.5 text-[9px]">
              Uncertainty
            </span>
            {draft.uncertainty}
          </p>
        )}
        {renderSupportingChips(draft.supporting_context_ids)}
        <div className="flex items-center gap-3 pt-2 flex-wrap">
          <form action={approveAction} className="contents">
            <input type="hidden" name="startupId" value={startupId} />
            <input type="hidden" name="tempId" value={draft.tempId} />
            <input type="hidden" name="category" value={draft.category} />
            <input type="hidden" name="title" value={draft.title} />
            <input type="hidden" name="content" value={draft.content} />
            <input type="hidden" name="rationale" value={draft.rationale} />
            <input type="hidden" name="uncertainty" value={draft.uncertainty ?? ""} />
            <input type="hidden" name="persistedId" value={draft.persistedId ?? ""} />
            <input
              type="hidden"
              name="supporting_context_ids"
              value={draft.supporting_context_ids.join(",")}
            />
            <ApproveButton />
          </form>
          <form action={rejectAction} className="contents">
            <input type="hidden" name="startupId" value={startupId} />
            <input type="hidden" name="tempId" value={draft.tempId} />
            <input type="hidden" name="category" value={draft.category} />
            <input type="hidden" name="title" value={draft.title} />
            <input type="hidden" name="content" value={draft.content} />
            <input type="hidden" name="rationale" value={draft.rationale} />
            <input
              type="hidden"
              name="supporting_context_ids"
              value={draft.supporting_context_ids.join(",")}
            />
            <RejectButton />
          </form>
        </div>
        {reviewError && (
          <p className="text-xs text-destructive pt-1">{reviewError}</p>
        )}
      </div>
    </div>
  );
}

function ActiveDecisionCard({
  decision,
  cat,
  renderSupportingChips,
}: {
  decision: LocalActiveDecision;
  cat: BrandDecisionCategory;
  renderSupportingChips: (ids: string[]) => React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  void cat;

  return (
    <div className="rounded-xl border border-foreground/15 bg-card text-card-foreground overflow-hidden">
      <div className="p-5 sm:p-6 space-y-3">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-2 flex-wrap">
            <CategoryBadge category={decision.category} tone="muted" />
            <h4 className="text-sm font-semibold leading-snug text-foreground tracking-tight">
              {decision.title}
            </h4>
            <span className="text-[9px] uppercase tracking-[0.18em] border border-foreground/25 rounded-full px-2 py-0.5 text-foreground">
              Active
            </span>
          </div>
          {(decision.rationale || decision.supporting_context_ids.length > 0) && (
            <button
              type="button"
              onClick={() => setOpen((o) => !o)}
              className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground hover:text-foreground transition-colors shrink-0"
            >
              {open ? "Hide why" : "Show why"}
            </button>
          )}
        </div>
        <RenderStructuredContent
          content={decision.content}
          category={decision.category}
        />
        {open && (
          <div className="space-y-3 pt-1 border-t border-border/60 mt-1">
            {decision.rationale && (
              <div className="pt-2">
                <div className="text-[9px] uppercase tracking-[0.18em] text-muted-foreground mb-1.5">
                  Rationale · why this decision exists
                </div>
                <p className="text-xs leading-relaxed text-muted-foreground whitespace-pre-wrap border-l-2 border-border pl-3">
                  {decision.rationale}
                </p>
              </div>
            )}
            {renderSupportingChips(decision.supporting_context_ids)}
          </div>
        )}
      </div>
    </div>
  );
}
