"use client";

import { useMemo, useState, useActionState } from "react";
import { useFormStatus } from "react-dom";
import {
  runDiscoveryAnalysis,
  approveDiscoveryItem,
  rejectDiscoveryItem,
  type DiscoveryActionState,
  type ProposedContextItemDraft,
  type ReviewActionState,
} from "@/app/actions/discovery";
import {
  runInterviewTurnAction,
  type InterviewActionState,
} from "@/app/actions/interview";
import type { ContextItem } from "@/lib/types/database";
import type { UnderstandingLine } from "@/lib/ai/dialogue";
import { ConfirmCheck } from "@/app/components/confirm-check";

type Props = {
  startupId: string;
  roughIdea: string;
  hasRawIdea: boolean;
  initialActiveContext: ContextItem[];
  initialRejectedCount: number;
};

type ContextType = "FACT" | "INFERENCE" | "HYPOTHESIS";

type ReviewItem = {
  tempId: string;
  type: ContextType;
  content: string;
  confidence: number | null;
  source: string | null;
  reasoning: string | null;
  origin: "interview" | "quick";
  state: "proposed" | "approved" | "rejected";
  persistedId?: string | null;
};

type ItemMeta = {
  confidence: number | null;
  source: string | null;
  reasoning: string | null;
};

type LocalActiveItem = {
  id: string;
  type: ContextType;
  content: string;
  meta: ItemMeta;
  created_at: string;
};

const TYPE_LABEL: Record<ContextType, string> = {
  FACT: "Fact",
  INFERENCE: "Inference",
  HYPOTHESIS: "Hypothesis",
};

const TYPE_HELP: Record<ContextType, string> = {
  FACT: "Something you actually said.",
  INFERENCE: "What I read into what you said.",
  HYPOTHESIS: "An assumption still to be proven.",
};

const TYPE_STYLE: Record<ContextType, string> = {
  FACT: "border-foreground/25 text-foreground",
  INFERENCE: "border-border text-muted-foreground",
  HYPOTHESIS: "border-dashed border-border text-muted-foreground",
};

function toLocalActive(items: ContextItem[]): LocalActiveItem[] {
  return items.map((c) => {
    const rawMeta =
      c.metadata && typeof c.metadata === "object" && !Array.isArray(c.metadata)
        ? (c.metadata as Record<string, unknown>)
        : null;
    return {
      id: c.id,
      type: c.type as ContextType,
      content: c.content,
      meta: {
        confidence: c.confidence,
        source: c.source,
        reasoning: rawMeta && typeof rawMeta.reasoning === "string" ? rawMeta.reasoning : null,
      },
      created_at: c.created_at,
    };
  });
}

function TypeBadge({ type }: { type: ContextType }) {
  return (
    <span
      className={`inline-flex items-center text-[0.78rem] px-2.5 py-0.5 rounded-full border ${TYPE_STYLE[type]}`}
    >
      {TYPE_LABEL[type]}
    </span>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h3 className="display text-[1.6rem] leading-tight">{children}</h3>;
}

function MicroLabel({ children }: { children: React.ReactNode }) {
  return <span className="eyebrow">{children}</span>;
}

/* ----------------------------- buttons ----------------------------- */

function ContinueInterviewButton({ disabled }: { disabled?: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={disabled || pending}
      className="inline-flex h-11 items-center justify-center rounded-full border border-foreground bg-foreground px-6 text-sm font-medium text-background transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/30 disabled:opacity-50 disabled:cursor-not-allowed"
    >
      {pending ? "Thinking…" : "Continue"}
    </button>
  );
}

function QuickAnalysisButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex h-10 items-center justify-center rounded-full border border-border bg-transparent px-5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground hover:border-foreground/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/25 disabled:opacity-50 disabled:cursor-not-allowed"
    >
      {pending ? "Analyzing…" : "Skip the interview · analyze my idea"}
    </button>
  );
}

function ScopeAnswerButton({ disabled }: { disabled?: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={disabled || pending}
      className="inline-flex h-10 items-center justify-center rounded-full border border-border bg-transparent px-5 text-sm font-medium text-foreground transition-colors hover:border-foreground/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/25 disabled:opacity-50 disabled:cursor-not-allowed"
    >
      {pending ? "Updating…" : "Answer"}
    </button>
  );
}

function ConfirmButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex h-10 items-center justify-center rounded-full border border-foreground bg-foreground px-4 text-sm font-medium text-background transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/30 disabled:opacity-50 disabled:cursor-not-allowed"
    >
      {pending ? "Confirming…" : "Confirm"}
    </button>
  );
}

function ConfirmedButton() {
  return (
    <span className="inline-flex h-10 items-center justify-center gap-2 rounded-full border border-primary/25 bg-accent/50 px-4 text-sm font-medium text-accent-foreground">
      <ConfirmCheck className="text-primary" />
      Confirmed
    </span>
  );
}

function SaveCorrectionButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex h-10 items-center justify-center rounded-full border border-foreground bg-foreground px-4 text-sm font-medium text-background transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/30 disabled:opacity-50 disabled:cursor-not-allowed"
    >
      {pending ? "Saving…" : "Save correction"}
    </button>
  );
}

function RejectButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex h-10 items-center justify-center rounded-full border border-border bg-transparent px-4 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground hover:border-foreground/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/25 disabled:opacity-50 disabled:cursor-not-allowed"
    >
      {pending ? "Rejecting…" : "Reject"}
    </button>
  );
}

function QuietButton({
  onClick,
  children,
}: {
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex h-10 items-center justify-center rounded-full border border-border bg-transparent px-5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground hover:border-foreground/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/25"
    >
      {children}
    </button>
  );
}

function QuietButtonFallback({ children }: { children: React.ReactNode }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex h-10 items-center justify-center rounded-full border border-border bg-transparent px-5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground hover:border-foreground/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/25 disabled:opacity-50"
    >
      {pending ? "Thinking…" : children}
    </button>
  );
}


/* ------------------------- review item card ------------------------- */

function ReviewItemCard({
  item,
  startupId,
  roughIdea,
  reviewError,
  onConfirmed,
  onRejected,
}: {
  item: ReviewItem;
  startupId: string;
  roughIdea: string;
  reviewError: string | undefined;
  onConfirmed: (tempId: string, persistedId: string, content: string) => void;
  onRejected: (tempId: string) => void;
}) {
  const [correcting, setCorrecting] = useState(false);
  const [correction, setCorrection] = useState(item.content);

  const bindConfirm = async (
    s: ReviewActionState | undefined,
    f: FormData,
  ): Promise<ReviewActionState> => {
    const res = await approveDiscoveryItem(s, f);
    if (res.newState === "approved" && res.updatedTempId && res.updatedId) {
      onConfirmed(res.updatedTempId, res.updatedId, f.get("content")?.toString() ?? item.content);
    }
    return res;
  };

  const bindReject = async (
    s: ReviewActionState | undefined,
    f: FormData,
  ): Promise<ReviewActionState> => {
    const res = await rejectDiscoveryItem(s, f);
    if (res.newState === "rejected" && res.updatedTempId) onRejected(res.updatedTempId);
    return res;
  };

  const [confirmState, confirmAction] = useActionState(bindConfirm, {});
  const [rejectState, rejectAction] = useActionState(bindReject, {});
  void confirmState;
  void rejectState;

  const decided = item.state !== "proposed";
  const effectiveContent = correcting ? correction.trim() : item.content;
  const canSaveCorrection = correcting && correction.trim().length > 0;

  return (
    <li
      className={`rise space-y-3 border-l-2 pl-5 transition-colors sm:pl-6 ${
        item.state === "approved"
          ? "border-foreground/30"
          : item.state === "rejected"
            ? "border-border opacity-60"
            : "border-border/70 hover:border-foreground/30"
      }`}
    >
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
        <TypeBadge type={item.type} />
        <span className="text-[0.85rem] text-muted-foreground">{TYPE_HELP[item.type]}</span>
        {item.confidence !== null && (
          <span className="text-[0.85rem] text-muted-foreground/80 tabular-nums">
            {Math.round(item.confidence * 100)}% confidence
          </span>
        )}
        {item.state === "approved" && (
          <span className="text-[0.85rem] text-foreground">Confirmed</span>
        )}
        {item.state === "rejected" && (
          <span className="text-[0.85rem] text-muted-foreground">Rejected</span>
        )}
      </div>

      {correcting ? (
        <textarea
          value={correction}
          onChange={(e) => setCorrection(e.target.value)}
          rows={4}
          className="w-full rounded-2xl border border-border/80 bg-card px-4 py-3.5 text-[1rem] leading-relaxed text-foreground outline-none focus:border-primary/40 focus-visible:ring-2 focus-visible:ring-primary/20"
          aria-label="Corrected statement"
        />
      ) : (
        <p className="text-[1.02rem] leading-[1.7] text-foreground/90 whitespace-pre-wrap">
          {item.content}
        </p>
      )}

      {item.reasoning && (
        <p className="text-[0.9rem] leading-relaxed text-muted-foreground whitespace-pre-wrap">
          {item.reasoning}
        </p>
      )}

        {item.state === "approved" && (
          <div className="flex flex-wrap items-center gap-3 pt-1">
            <ConfirmedButton />
          </div>
        )}

        {!decided && (
          <div className="flex flex-wrap items-center gap-3 pt-1">
            {canSaveCorrection ? (
              <form action={confirmAction} className="contents">
                <input type="hidden" name="startupId" value={startupId} />
                <input type="hidden" name="tempId" value={item.tempId} />
                <input type="hidden" name="type" value={item.type} />
                <input type="hidden" name="content" value={effectiveContent} />
                <input type="hidden" name="source" value={item.source ?? ""} />
                <input
                  type="hidden"
                  name="confidence"
                  value={item.confidence === null ? "" : String(item.confidence)}
                />
                <input type="hidden" name="reasoning" value={item.reasoning ?? ""} />
                <input type="hidden" name="roughIdea" value={roughIdea} />
                <SaveCorrectionButton />
              </form>
            ) : (
              <form action={confirmAction} className="contents">
                <input type="hidden" name="startupId" value={startupId} />
                <input type="hidden" name="tempId" value={item.tempId} />
                <input type="hidden" name="type" value={item.type} />
                <input type="hidden" name="content" value={item.content} />
                <input type="hidden" name="source" value={item.source ?? ""} />
                <input
                  type="hidden"
                  name="confidence"
                  value={item.confidence === null ? "" : String(item.confidence)}
                />
                <input type="hidden" name="reasoning" value={item.reasoning ?? ""} />
                <input type="hidden" name="roughIdea" value={roughIdea} />
                <ConfirmButton />
              </form>
            )}

            <QuietButton onClick={() => setCorrecting((c) => !c)}>
              {correcting ? "Cancel correction" : "Correct"}
            </QuietButton>

            <form action={rejectAction} className="contents">
              <input type="hidden" name="startupId" value={startupId} />
              <input type="hidden" name="tempId" value={item.tempId} />
              <input type="hidden" name="type" value={item.type} />
              <input type="hidden" name="content" value={item.content} />
              <input type="hidden" name="source" value={item.source ?? ""} />
              <input
                type="hidden"
                name="confidence"
                value={item.confidence === null ? "" : String(item.confidence)}
              />
              <input type="hidden" name="reasoning" value={item.reasoning ?? ""} />
              <input type="hidden" name="rejectionReason" value="" />
              <input type="hidden" name="roughIdea" value={roughIdea} />
              <RejectButton />
            </form>
          </div>
        )}

        {reviewError && <p className="text-[0.9rem] text-destructive">{reviewError}</p>}
    </li>
  );
}

/* ---------------------------- section ------------------------------ */

const FIRST_QUESTION = "What are you trying to build? Tell me about it in your own words.";

const UNCERTAINTY_REPLIES = [
  "I'm not sure yet.",
  "I don't know yet.",
  "That's not what I meant.",
  "Let's skip this for now.",
];

function UnderstandingPanel({ lines }: { lines?: UnderstandingLine[] }) {
  if (!lines || lines.length === 0) return null;
  return (
    <div className="space-y-3">
      <MicroLabel>What I&apos;m understanding</MicroLabel>
      <ul className="space-y-2 border-l border-border/60 pl-5">
        {lines.map((line, idx) => (
          <li
            key={idx}
            className="text-[0.98rem] leading-relaxed text-foreground/90 flex gap-3"
          >
            <span aria-hidden className={line.status === "open" ? "text-muted-foreground/60" : "text-primary/70"}>
              {line.status === "open" ? "?" : "✓"}
            </span>
            <span className={line.status === "open" ? "text-muted-foreground" : undefined}>
              {line.text}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ReplyChips({ onPick }: { onPick: (reply: string) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-2 pt-1">
      <span className="text-[0.85rem] text-muted-foreground">Not sure?</span>
      {UNCERTAINTY_REPLIES.map((reply) => (
        <button
          key={reply}
          type="button"
          onClick={() => onPick(reply)}
          className="inline-flex h-9 items-center rounded-full border border-border px-3.5 text-[0.85rem] text-muted-foreground transition-colors hover:text-foreground hover:border-foreground/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/25"
        >
          {reply}
        </button>
      ))}
    </div>
  );
}

function AnswerBox({
  value,
  onChange,
  placeholder,
  rows = 4,
  autoFocus,
}: {
  value: string;
  onChange: (next: string) => void;
  placeholder: string;
  rows?: number;
  autoFocus?: boolean;
}) {
  return (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      rows={rows}
      placeholder={placeholder}
      autoFocus={autoFocus}
                  className="field w-full rounded-2xl border border-border/80 bg-card px-5 py-4 text-[1.02rem] leading-relaxed text-foreground outline-none placeholder:text-muted-foreground/60"
    />
  );
}

const EMPTY_INTERVIEW: InterviewActionState = {};
const EMPTY_DISCOVERY: DiscoveryActionState = {};

export function DiscoverySection({
  startupId,
  roughIdea,
  hasRawIdea,
  initialActiveContext,
  initialRejectedCount,
}: Props) {
  const [interviewState, dispatchInterview] = useActionState(
    runInterviewTurnAction,
    EMPTY_INTERVIEW,
  );
  const [quickState, dispatchQuick] = useActionState(runDiscoveryAnalysis, EMPTY_DISCOVERY);

  const [phase, setPhase] = useState<"intro" | "question" | "summary">("intro");
  const [currentQuestion, setCurrentQuestion] = useState<string>(FIRST_QUESTION);
  const [questionWhy, setQuestionWhy] = useState<string | null>(null);
  const [transcript, setTranscript] = useState<
    Array<{ question: string; answer: string }>
  >([]);
  const [answer, setAnswer] = useState("");
  const [forceSummary, setForceSummary] = useState(false);
  const [scopeAnswer, setScopeAnswer] = useState("");
  const [reviewItems, setReviewItems] = useState<ReviewItem[]>([]);
  const [activeItems, setActiveItems] = useState<LocalActiveItem[]>(() =>
    toLocalActive(initialActiveContext),
  );
  const [rejectedCount, setRejectedCount] = useState(initialRejectedCount);
  const [reviewErrors, setReviewErrors] = useState<Record<string, string>>({});

  const [syncedTurn, setSyncedTurn] = useState<InterviewActionState | null>(null);

  /* Sync the latest interview turn into the view. Comparing against the last
     synced turn keeps this render-phase update idempotent (one sync per turn). */
  if (
    interviewState.stage === "question" &&
    interviewState.question &&
    interviewState !== syncedTurn
  ) {
    setSyncedTurn(interviewState);
    // Carry the answer that was just submitted into the running conversation.
    if (answer.trim()) {
      setTranscript((prev) => [...prev, { question: currentQuestion, answer: answer.trim() }]);
    }
    setCurrentQuestion(interviewState.question.question);
    setQuestionWhy(interviewState.question.why ?? null);
    setAnswer("");
    setForceSummary(false);
    setPhase("question");
  }
  if (
    interviewState.stage === "summary" &&
    interviewState.summary !== undefined &&
    interviewState !== syncedTurn
  ) {
    setSyncedTurn(interviewState);
    setPhase("summary");
  }
  if (quickState.proposed && quickState.proposed.length > 0 && reviewItems.length === 0) {
    setReviewItems(
      quickState.proposed.map((d: ProposedContextItemDraft) => ({
        tempId: d.tempId,
        type: d.type,
        content: d.content,
        confidence: d.confidence,
        source: d.source,
        reasoning: d.reasoning,
        origin: "quick" as const,
        state: d.state,
      })),
    );
    setPhase("summary");
  }

  const summaryItems = useMemo<ReviewItem[]>(() => {
    if (interviewState.stage !== "summary" || !interviewState.summary) return [];
    const s = interviewState.summary;
    const out: ReviewItem[] = [];
    let seq = 0;
    const push = (type: ContextType, item: (typeof s.facts)[number]) => {
      seq += 1;
      out.push({
        tempId: `iv_${seq}_${type}`,
        type,
        content: item.content,
        confidence: item.confidence,
        source: item.source,
        reasoning: item.reasoning,
        origin: "interview",
        state: "proposed",
      });
    };
    for (const item of s.facts) push("FACT", item);
    for (const item of s.inferences) push("INFERENCE", item);
    for (const item of s.hypotheses) push("HYPOTHESIS", item);
    return out;
  }, [interviewState.summary, interviewState.stage]);

  const mergedItems = useMemo(() => {
    if (reviewItems.length > 0) return reviewItems;
    return summaryItems;
  }, [reviewItems, summaryItems]);

  const groupedItems = useMemo(() => {
    const groups: Record<ContextType, ReviewItem[]> = { FACT: [], INFERENCE: [], HYPOTHESIS: [] };
    for (const item of mergedItems) groups[item.type].push(item);
    return groups;
  }, [mergedItems]);

  const activeGrouped = useMemo(() => {
    const groups: Record<ContextType, LocalActiveItem[]> = { FACT: [], INFERENCE: [], HYPOTHESIS: [] };
    for (const a of activeItems) groups[a.type].push(a);
    return groups;
  }, [activeItems]);

  const handleConfirmed = (tempId: string, persistedId: string, content: string) => {
    const source = mergedItems.find((i) => i.tempId === tempId);
    setReviewItems((prev) =>
      prev.length > 0
        ? prev.map((i) =>
            i.tempId === tempId
              ? { ...i, state: "approved" as const, persistedId }
              : i,
          )
        : prev,
    );
    setActiveItems((prev) => {
      if (prev.some((a) => a.id === persistedId)) return prev;
      return [
        ...prev,
        {
          id: persistedId,
          type: (source?.type ?? "FACT") as ContextType,
          content,
          meta: {
            confidence: source?.confidence ?? null,
            source: source?.source ?? null,
            reasoning: source?.reasoning ?? null,
          },
          created_at: new Date().toISOString(),
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
    setReviewItems((prev) =>
      prev.length > 0
        ? prev.map((i) => (i.tempId === tempId ? { ...i, state: "rejected" as const } : i))
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

  const scopeQuestion = interviewState.scopeQuestion ?? null;
  const activeTotal = activeItems.length;
  const pendingCount = mergedItems.filter((i) => i.state === "proposed").length;
  const hasSummary = mergedItems.length > 0;

  /** The full conversation, including the answer currently being written. */
  const conversation = useMemo(
    () =>
      answer.trim()
        ? [...transcript, { question: currentQuestion, answer: answer.trim() }]
        : transcript,
    [transcript, currentQuestion, answer],
  );

  return (
    <section className="max-w-3xl">
      <div className="space-y-3">
        <p className="eyebrow">Discover</p>
        <h2 className="display text-[2.1rem] sm:text-[2.5rem] leading-[1.1]">
          We understand your startup.
        </h2>
        <p className="text-[0.98rem] leading-relaxed text-muted-foreground max-w-xl">
          Before any brand work happens, we listen. I ask only when something is
          unclear, then read back everything I understood — as facts, what I inferred,
          and what I am still guessing. You correct me. Only what you confirm becomes
          context.
        </p>
        {activeTotal > 0 && (
          <p className="text-[0.85rem] text-muted-foreground/80 tabular-nums">
            {activeTotal} approved · {rejectedCount} rejected
          </p>
        )}
      </div>

      {hasRawIdea && (
        <div className="mt-10 space-y-2.5 border-l-2 border-border/70 pl-5 sm:pl-6">
          <MicroLabel>Your starting point</MicroLabel>
          <p className="text-[1.05rem] leading-[1.7] text-foreground/90 whitespace-pre-wrap">
            {roughIdea}
          </p>
        </div>
      )}

      {phase === "intro" && (
        <div className="mt-12 space-y-8">
          <form action={dispatchInterview} className="space-y-5">
            <input type="hidden" name="startupId" value={startupId} />
            <input
              type="hidden"
              name="transcript"
              value={JSON.stringify(conversation)}
            />
            <p className="display text-[1.5rem] sm:text-[1.75rem] leading-snug max-w-2xl">
              {FIRST_QUESTION}
            </p>
            <AnswerBox
              value={answer}
              onChange={setAnswer}
              placeholder="Describe your idea in your own words"
              rows={5}
              autoFocus
            />
            <div className="flex flex-wrap items-center gap-4">
              <ContinueInterviewButton disabled={answer.trim().length === 0} />
              <ReplyChips
                onPick={(reply) =>
                  setAnswer((prev) => (prev.trim() ? `${prev.trim()} ${reply}` : reply))
                }
              />
            </div>
          </form>

          <div className="flex flex-wrap items-center gap-4 border-t border-border/70 pt-6">
            <form action={dispatchQuick} className="contents">
              <input type="hidden" name="startupId" value={startupId} />
              <QuickAnalysisButton />
            </form>
            <span className="text-[0.9rem] text-muted-foreground">
              Already know your idea well? Skip the conversation.
            </span>
          </div>

          {(interviewState.error || quickState.error) && (
            <p className="text-[0.95rem] text-destructive whitespace-pre-wrap leading-relaxed">
              {interviewState.error ?? quickState.error}
            </p>
          )}
        </div>
      )}

      {phase === "question" && (
        <form action={dispatchInterview} className="mt-12 space-y-8">
          <input type="hidden" name="startupId" value={startupId} />
          <input
            type="hidden"
            name="forceSummary"
            value={forceSummary ? "1" : "0"}
          />
          <input
            type="hidden"
            name="transcript"
            value={JSON.stringify(conversation)}
          />

          <div className="space-y-4">
            <MicroLabel>Discovering your idea</MicroLabel>
            <p className="display text-[1.5rem] sm:text-[1.75rem] leading-snug max-w-2xl">
              {currentQuestion}
            </p>
            {questionWhy && (
              <p className="text-[0.95rem] leading-relaxed text-muted-foreground max-w-xl">
                {questionWhy}
              </p>
            )}
          </div>

          <AnswerBox
            value={answer}
            onChange={setAnswer}
            placeholder="Answer in your own words"
            autoFocus
          />

          <div className="flex flex-wrap items-center gap-4">
            <ContinueInterviewButton disabled={answer.trim().length === 0} />
            <ReplyChips
              onPick={(reply) =>
                setAnswer((prev) => (prev.trim() ? `${prev.trim()} ${reply}` : reply))
              }
            />
          </div>

          <div className="flex flex-wrap items-center gap-4 border-t border-border/70 pt-6">
            <QuietButton
              onClick={() => {
                setForceSummary(true);
                setAnswer(
                  answer.trim() || "That's all I can explain for now.",
                );
              }}
            >
              I think I&apos;ve said enough — summarize
            </QuietButton>
          </div>

          {interviewState.error && (
            <p className="text-[0.95rem] text-destructive whitespace-pre-wrap leading-relaxed">
              {interviewState.error}
            </p>
          )}

          <UnderstandingPanel lines={interviewState.understanding} />
        </form>
      )}

      {phase === "summary" && (
        <div className="mt-12 space-y-10">
          <div className="space-y-3 max-w-2xl">
            <MicroLabel>Here&apos;s what I think I understand</MicroLabel>
            {interviewState.closing && (
              <p className="text-[1rem] leading-[1.7] text-muted-foreground">
                {interviewState.closing}
              </p>
            )}
            <h3 className="display text-[1.6rem] sm:text-[1.9rem] leading-snug">
              Is this an accurate picture of what you&apos;re building?
            </h3>
            <p className="text-[0.98rem] leading-relaxed text-muted-foreground">
              I haven&apos;t changed anything yet. Confirm what I got right, correct
              anything I misread, and reject what isn&apos;t true — only what you
              confirm becomes context for the Brand stage.
            </p>
          </div>

          <UnderstandingPanel lines={interviewState.understanding} />

          {scopeQuestion && (
            <div className="space-y-3 border-l-2 border-border/70 pl-5 sm:pl-6">
              <MicroLabel>One thing I don&apos;t want to assume</MicroLabel>
              <p className="text-[1.05rem] leading-[1.7] text-foreground/90">
                {scopeQuestion}
              </p>
              <form action={dispatchInterview} className="space-y-3 pt-1">
                <input type="hidden" name="startupId" value={startupId} />
                <input
                  type="hidden"
                  name="transcript"
                  value={JSON.stringify([
                    ...conversation,
                    { question: "How wide should this idea stay?", answer: scopeAnswer.trim() },
                  ])}
                />
                <textarea
                  value={scopeAnswer}
                  onChange={(e) => setScopeAnswer(e.target.value)}
                  rows={3}
                  placeholder="Tell me how wide the business should be"
      className="field w-full rounded-2xl border border-border/80 bg-card px-5 py-4 text-[1.02rem] leading-relaxed text-foreground outline-none placeholder:text-muted-foreground/60"
                />
                <ScopeAnswerButton disabled={scopeAnswer.trim().length === 0} />
              </form>
            </div>
          )}

          {hasSummary ? (
            (["FACT", "INFERENCE", "HYPOTHESIS"] as const).map((bucket) => {
              const items = groupedItems[bucket];
              if (items.length === 0) return null;
              return (
                <div key={bucket} className="space-y-6">
                  <div className="flex flex-wrap items-center gap-3">
                    <TypeBadge type={bucket} />
                    <span className="text-[0.9rem] text-muted-foreground">
                      {TYPE_HELP[bucket]}
                    </span>
                  </div>
                  <ul className="space-y-7">
                    {items.map((item) => (
                      <ReviewItemCard
                        key={item.tempId}
                        item={item}
                        startupId={startupId}
                        roughIdea={roughIdea}
                        reviewError={reviewErrors[item.tempId]}
                        onConfirmed={handleConfirmed}
                        onRejected={handleRejected}
                      />
                    ))}
                  </ul>
                </div>
              );
            })
          ) : (
            <p className="text-[0.95rem] text-muted-foreground">
              Nothing to review yet.
            </p>
          )}

          <div className="flex flex-wrap items-center gap-4 border-t border-border/70 pt-6">
            <p className="text-[0.95rem] text-muted-foreground">
              {pendingCount > 0
                ? `${pendingCount} item${pendingCount === 1 ? "" : "s"} still waiting on you.`
                : "Everything reviewed."}
            </p>
            <form action={dispatchInterview} className="contents">
              <input type="hidden" name="startupId" value={startupId} />
              <input type="hidden" name="forceSummary" value="0" />
              <input type="hidden" name="transcript" value={JSON.stringify(conversation)} />
              <QuietButtonFallback>Continue the conversation</QuietButtonFallback>
            </form>
          </div>

          {interviewState.error && (
            <p className="text-[0.95rem] text-destructive whitespace-pre-wrap leading-relaxed">
              {interviewState.error}
            </p>
          )}
        </div>
      )}

      {activeTotal > 0 && (
        <div className="mt-16 space-y-10">
          <div className="rule" />
          <div className="space-y-2">
            <SectionTitle>Approved context</SectionTitle>
            <p className="text-[0.95rem] text-muted-foreground max-w-xl">
              Confirmed by you. This is the context every later decision is built on.
            </p>
          </div>
          {(["FACT", "INFERENCE", "HYPOTHESIS"] as const).map((bucket) => {
            const items = activeGrouped[bucket];
            if (items.length === 0) return null;
            return (
              <div key={bucket} className="space-y-4">
                <div className="flex items-center gap-3">
                  <TypeBadge type={bucket} />
                  <span className="text-[0.85rem] text-muted-foreground/80 tabular-nums">
                    {items.length}
                  </span>
                </div>
                <ul className="space-y-4">
                  {items.map((item) => (
                    <li
                      key={item.id}
                      className="rise space-y-2 border-l-2 border-border/60 pl-5"
                    >
                      <p className="text-[1.02rem] leading-[1.7] text-foreground/90 whitespace-pre-wrap">
                        {item.content}
                      </p>
                      {item.meta.reasoning && (
                        <p className="text-[0.9rem] leading-relaxed text-muted-foreground whitespace-pre-wrap">
                          {item.meta.reasoning}
                        </p>
                      )}
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
