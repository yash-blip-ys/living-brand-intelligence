"use client";

import { useMemo, useState, useActionState } from "react";
import { useFormStatus } from "react-dom";
import type { BrandDecision, BrandDecisionCategory, ContextItem } from "@/lib/types/database";
import type { DecisionContextSupport } from "@/lib/db/brand-decisions";
import {
  runStrategyGeneration,
  approveStrategyDecision,
  rejectStrategyDecision,
  challengeStrategyRecommendation,
  type StrategyActionState,
  type ProposedDecisionDraft,
  type DecisionReviewState,
  type ChallengeReasoningState,
} from "@/app/actions/strategy";
import { BRAND_PRIORITIES, BRAND_PERSONALITIES } from "@/lib/ai/brand-direction";
import { resolveContextRefs } from "@/lib/context-refs";
import { ConfirmCheck } from "@/app/components/confirm-check";

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
    FACT: "text-foreground/90",
    INFERENCE: "text-muted-foreground",
    HYPOTHESIS: "text-muted-foreground/80",
  };
  return <span className={`eyebrow ${styles[type]}`}>{type}</span>;
}

function CategoryBadge({
  category,
  tone,
}: {
  category: BrandDecisionCategory;
  tone?: "default" | "muted";
}) {
  return (
    <span className={`eyebrow ${tone === "muted" ? "text-muted-foreground/80" : ""}`}>
      {CATEGORY_LABEL[category]}
    </span>
  );
}

function MicroLabel({ children }: { children: React.ReactNode }) {
  return <span className="eyebrow">{children}</span>;
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
      out[p.slice(0, nl).trim()] = p.slice(nl + 1).trim();
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
  if (!MULTI_SECTION_CATEGORIES.includes(category)) {
    return (
      <p className="text-[1.02rem] leading-[1.75] text-foreground/92 whitespace-pre-wrap">
        {content}
      </p>
    );
  }
  const sections = parseSections(content);
  const keys = Object.keys(sections);
  if (keys.length === 1 && keys[0] === "") {
    return (
      <p className="text-[1.02rem] leading-[1.75] text-foreground/92 whitespace-pre-wrap">
        {sections[""]}
      </p>
    );
  }
  return (
    <div className="space-y-6">
      {Object.entries(sections).map(([k, v]) => {
        if (!v.trim() && k) {
          return (
            <p key={k} className="eyebrow">
              {k}
            </p>
          );
        }
        const lower = k.toLowerCase();
        const bullets =
          lower.includes("do") ||
          lower.includes("don") ||
          lower.includes("principle") ||
          lower.includes("avoid") ||
          lower.includes("trait") ||
          lower.includes("risk") ||
          lower.includes("direction") ||
          lower.includes("proof") ||
          lower.includes("supporting");
        return (
          <div key={k || "content"}>
            {k && <p className="eyebrow mb-2">{k}</p>}
            {bullets ? (
              <ul className="space-y-1.5">
                {v.split("\n").map((line, idx) => {
                  const clean = line.trim().replace(/^(-\s*|\d+\.\s*|\*\s*)/, "");
                  if (!clean) return null;
                  return (
                    <li
                      key={idx}
                      className="text-[1.02rem] leading-[1.7] text-foreground/90 pl-4 relative"
                    >
                      <span className="absolute left-0 text-muted-foreground/50">·</span>
                      {clean}
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="text-[1.02rem] leading-[1.75] text-foreground/92 whitespace-pre-wrap">
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
  { key: "visual", label: "Visual Strategist", desc: "Logo · Type · Color · Shape · Imagery" },
  { key: "critic", label: "Brand Critic", desc: "Generic · Contradiction · Bias · Audience · Claims" },
  { key: "guardian", label: "Consistency Guardian", desc: "9 cross-checks · Pass / Review / Unproven" },
  { key: "launch", label: "Launch Strategist", desc: "Headline · Sub · CTA · Social copy" },
];

/* ----------------------------- inputs ------------------------------ */

const fieldClass =
  "field w-full rounded-2xl border border-border/80 bg-card px-4 py-3 text-[0.95rem] leading-relaxed text-foreground outline-none placeholder:text-muted-foreground/60";

function ChoiceChip({
  label,
  selected,
  onToggle,
}: {
  label: string;
  selected: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={selected}
      className={`inline-flex h-9 items-center rounded-full border px-4 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/25 ${
        selected
          ? "border-primary/40 bg-accent text-accent-foreground"
          : "border-border/80 bg-transparent text-muted-foreground hover:text-foreground hover:border-foreground/25"
      }`}
    >
      {selected && <span aria-hidden className="mr-2 h-1.5 w-1.5 rounded-full bg-primary" />}
      {label}
    </button>
  );
}

function GenerateButton({
  disabled,
  generated,
}: {
  disabled?: boolean;
  generated?: boolean;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={disabled || pending}
      className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-primary px-6 text-sm font-medium text-primary-foreground shadow-[0_1px_2px_oklch(0.4_0.06_42/0.18)] hover:brightness-[1.04] focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:opacity-45 disabled:cursor-not-allowed"
    >
      {pending ? (
        "Generating strategy…"
      ) : generated ? (
        <>
          <ConfirmCheck />
          Strategy generated
        </>
      ) : (
        "Generate strategy"
      )}
    </button>
  );
}

function BrandDirectionForm({
  startupId,
  dispatch,
  disabled,
  generated,
}: {
  startupId: string;
  dispatch: (payload: FormData) => void;
  disabled: boolean;
  generated?: boolean;
}) {
  const [priorities, setPriorities] = useState<string[]>([]);
  const [otherPriority, setOtherPriority] = useState("");
  const [personality, setPersonality] = useState<string[]>([]);
  const [personalityOther, setPersonalityOther] = useState("");
  const [mustCommunicate, setMustCommunicate] = useState("");
  const [neverFeel, setNeverFeel] = useState("");
  const [doNotOverride, setDoNotOverride] = useState("");

  const toggle = (
    value: string,
    current: string[],
    setter: (next: string[]) => void,
    max: number,
  ) => {
    if (current.includes(value)) {
      setter(current.filter((v) => v !== value));
      return;
    }
    if (current.length >= max) return;
    setter([...current, value]);
  };

  return (
    <form action={dispatch} className="space-y-10 border-t border-border/70 pt-10">
      <input type="hidden" name="startupId" value={startupId} />
      <div className="max-w-2xl space-y-3">
        <p className="eyebrow">Brand direction</p>
        <h3 className="display text-[1.6rem]">Shape your brand direction</h3>
        <p className="text-[0.95rem] leading-relaxed text-muted-foreground">
          This is your intent, not evidence about the startup. It guides the AI before
          it proposes anything — it never becomes an approved Fact and never overrides
          the context you confirmed in Discovery.
        </p>
      </div>

      <fieldset className="space-y-3">
        <legend className="text-[1.02rem] text-foreground">
          What should this brand optimize for?
        </legend>
        <div className="flex flex-wrap gap-2">
          {BRAND_PRIORITIES.map((p) => (
            <ChoiceChip
              key={p}
              label={p}
              selected={priorities.includes(p)}
              onToggle={() => toggle(p, priorities, setPriorities, 3)}
            />
          ))}
        </div>
        <input type="hidden" name="founderPriorities" value={priorities.join(",")} />
        <input
          value={otherPriority}
          onChange={(e) => setOtherPriority(e.target.value)}
          placeholder="Something else (up to 3 total)"
          className={fieldClass}
        />
        <input type="hidden" name="founderOtherPriority" value={otherPriority} />
        {priorities.length >= 3 && (
          <p className="text-sm text-muted-foreground">
            Three selected — deselect one to change it.
          </p>
        )}
      </fieldset>

      <fieldset className="space-y-2">
        <legend className="text-[1.02rem] text-foreground">
          What MUST this brand communicate?
        </legend>
        <textarea
          value={mustCommunicate}
          onChange={(e) => setMustCommunicate(e.target.value)}
          rows={2}
          placeholder="The non-negotiable message"
          className={fieldClass}
        />
        <input type="hidden" name="founderMustCommunicate" value={mustCommunicate} />
      </fieldset>

      <fieldset className="space-y-2">
        <legend className="text-[1.02rem] text-foreground">
          What should this brand NEVER feel like?
        </legend>
        <textarea
          value={neverFeel}
          onChange={(e) => setNeverFeel(e.target.value)}
          rows={2}
          placeholder="The tone or look that would make this brand unrecognizable"
          className={fieldClass}
        />
        <input type="hidden" name="founderNeverFeel" value={neverFeel} />
      </fieldset>

      <fieldset className="space-y-3">
        <legend className="text-[1.02rem] text-foreground">
          What personality directions feel right?
        </legend>
        <div className="flex flex-wrap gap-2">
          {BRAND_PERSONALITIES.map((p) => (
            <ChoiceChip
              key={p}
              label={p}
              selected={personality.includes(p)}
              onToggle={() => toggle(p, personality, setPersonality, 7)}
            />
          ))}
        </div>
        <input type="hidden" name="founderPersonality" value={personality.join(",")} />
        <input
          value={personalityOther}
          onChange={(e) => setPersonalityOther(e.target.value)}
          placeholder="In your own words"
          className={fieldClass}
        />
        <input type="hidden" name="founderPersonalityOther" value={personalityOther} />
      </fieldset>

      <fieldset className="space-y-2">
        <legend className="text-[1.02rem] text-foreground">
          Anything you already believe about the brand that the AI should not override?
        </legend>
        <textarea
          value={doNotOverride}
          onChange={(e) => setDoNotOverride(e.target.value)}
          rows={2}
          placeholder="A conviction you want protected, even if the AI would choose otherwise"
          className={fieldClass}
        />
        <input type="hidden" name="founderDoNotOverride" value={doNotOverride} />
      </fieldset>

      <div className="flex flex-wrap items-center gap-4">
        <GenerateButton disabled={disabled} generated={generated} />
        {disabled && (
          <span className="text-[0.85rem] text-muted-foreground">
            Approve context in Discovery first.
          </span>
        )}
      </div>
    </form>
  );
}

/* -------------------------- recommendation ------------------------- */

function AgreeButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex h-10 items-center justify-center rounded-full bg-primary px-5 text-sm font-medium text-primary-foreground shadow-[0_1px_2px_oklch(0.4_0.06_42/0.18)] hover:brightness-[1.04] focus-visible:ring-2 focus-visible:ring-primary/30 disabled:opacity-45 disabled:cursor-not-allowed"
    >
      {pending ? "Activating…" : "Agree"}
    </button>
  );
}

/** Replaces the Agree button the moment the decision is actually active. */
function ApprovedButton() {
  return (
    <span className="inline-flex h-10 items-center justify-center gap-2 rounded-full border border-primary/25 bg-accent/50 px-5 text-sm font-medium text-accent-foreground">
      <ConfirmCheck className="text-primary" />
      Decision active
    </span>
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
      className="inline-flex h-10 items-center justify-center rounded-full border border-border/70 bg-transparent px-5 text-sm text-muted-foreground transition-colors hover:text-foreground hover:border-foreground/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20"
    >
      {children}
    </button>
  );
}

function RejectButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex h-10 items-center justify-center rounded-full border border-border/70 bg-transparent px-5 text-sm text-muted-foreground transition-colors hover:text-foreground hover:border-foreground/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20 disabled:opacity-45 disabled:cursor-not-allowed"
    >
      {pending ? "Rejecting…" : "Reject"}
    </button>
  );
}

function SubmitChallengeButton({ disabled }: { disabled?: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={disabled || pending}
      className="inline-flex h-10 items-center justify-center rounded-full bg-primary px-5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 disabled:opacity-45 disabled:cursor-not-allowed"
    >
      {pending ? "Thinking…" : "Send to the AI"}
    </button>
  );
}

function SpeechBlock({
  label,
  children,
  emphasis = false,
}: {
  label: string;
  children: React.ReactNode;
  emphasis?: boolean;
}) {
  return (
    <div className="space-y-2 pl-4 border-l-2 border-border/70">
      <MicroLabel>{label}</MicroLabel>
      <div
        className={`text-[0.98rem] leading-[1.7] whitespace-pre-wrap ${
          emphasis ? "text-foreground" : "text-muted-foreground"
        }`}
      >
        {children}
      </div>
    </div>
  );
}

function GroundedChips({
  ids,
  contextById,
}: {
  ids: string[];
  contextById: Map<string, ContextItem>;
}) {
  const items = ids
    .map((id) => contextById.get(id))
    .filter((c): c is ContextItem => Boolean(c));
  if (items.length === 0) return null;
  return (
    <ul className="space-y-2.5">
      {items.slice(0, 5).map((ctx) => (
        <li
          key={ctx.id}
          className="text-[0.85rem] leading-relaxed text-muted-foreground flex gap-2.5"
        >
          <TypeBadge
            type={
              (ctx.type === "FACT" || ctx.type === "INFERENCE" || ctx.type === "HYPOTHESIS"
                ? ctx.type
                : "FACT") as "FACT" | "INFERENCE" | "HYPOTHESIS"
            }
          />
          <span className="min-w-0">{ctx.content}</span>
        </li>
      ))}
      {items.length > 5 && (
        <li className="text-[0.8rem] text-muted-foreground/80 pl-2">
          +{items.length - 5} more
        </li>
      )}
    </ul>
  );
}

function ProposedDecisionCard({
  draft,
  startupId,
  contextById,
  reviewError,
  onApproved,
  onRejected,
  onStaged,
}: {
  draft: ProposedDecisionDraft;
  startupId: string;
  contextById: Map<string, ContextItem>;
  reviewError: string | undefined;
  onApproved: (tempId: string, persistedId: string, staged: ProposedDecisionDraft) => void;
  onRejected: (tempId: string) => void;
  onStaged: (tempId: string, staged: ProposedDecisionDraft) => void;
}) {
  const [challengeOpen, setChallengeOpen] = useState(false);
  const [objection, setObjection] = useState("");
  const [response, setResponse] = useState<ChallengeReasoningState | null>(null);
  const [staged, setStaged] = useState<ProposedDecisionDraft | null>(null);

  const bindApprove = async (
    s: DecisionReviewState | undefined,
    f: FormData,
  ): Promise<DecisionReviewState> => {
    const res = await approveStrategyDecision(s, f);
    if (res.newState === "approved" && res.updatedTempId && res.updatedId) {
      onApproved(res.updatedTempId, res.updatedId, staged ?? draft);
    }
    return res;
  };
  const bindReject = async (
    s: DecisionReviewState | undefined,
    f: FormData,
  ): Promise<DecisionReviewState> => {
    const res = await rejectStrategyDecision(s, f);
    if (res.newState === "rejected" && res.updatedTempId) onRejected(res.updatedTempId);
    return res;
  };
  const bindChallenge = async (
    s: ChallengeReasoningState | undefined,
    f: FormData,
  ): Promise<ChallengeReasoningState> => {
    const res = await challengeStrategyRecommendation(s, f);
    if (!res.error) {
      setResponse(res);
      setStaged(null);
    }
    return res;
  };

  const [approveState, approveAction] = useActionState(bindApprove, {});
  const [rejectState, rejectAction] = useActionState(bindReject, {});
  const [challengeState, challengeAction] = useActionState(bindChallenge, {});
  void approveState;
  void rejectState;
  void challengeState;

  const effective = staged ?? draft;
  const decided = draft.state !== "proposed";
  const hasRevision = Boolean(response?.revised);

  const rationaleBullets = (effective.rationale ?? "")
    .split("\n")
    .map((l) => l.trim().replace(/^(-\s*|\d+\.\s*|\*\s*)/, ""))
    .filter(Boolean);

  const acceptRevision = () => {
    if (!response?.revised) return;
    const next: ProposedDecisionDraft = {
      ...draft,
      title: response.revised.title,
      content: response.revised.content,
      rationale: response.revised.rationale || draft.rationale,
      uncertainty: response.revised.uncertainty ?? draft.uncertainty,
    };
    setStaged(next);
    onStaged(draft.tempId, next);
    setResponse(null);
    setChallengeOpen(false);
  };

  return (
    <article className="rise space-y-6 pt-8 first:pt-0">
      <div className="space-y-2">
        <MicroLabel>AI recommendation</MicroLabel>
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
          <CategoryBadge category={draft.category} />
          <h4 className="display text-[1.45rem] leading-snug text-foreground">
            {effective.title}
          </h4>
        </div>
      </div>

      {staged && (
        <p className="text-sm text-accent-foreground bg-accent/40 rounded-2xl px-4 py-3">
          Staged revision — review it, then press Agree to make it active.
          Nothing is live until you do.
        </p>
      )}

      <RenderStructuredContent content={effective.content} category={draft.category} />

      {rationaleBullets.length > 0 && (
        <div className="space-y-3">
          <MicroLabel>Why I&apos;m recommending this</MicroLabel>
          <ul className="space-y-2">
            {rationaleBullets.map((line, idx) => (
              <li
                key={idx}
                className="text-[0.98rem] leading-[1.7] text-foreground/85 pl-4 relative"
              >
                <span className="absolute left-0 text-muted-foreground/50">·</span>
                {resolveContextRefs(line, contextById)}
              </li>
            ))}
          </ul>
        </div>
      )}

      {effective.uncertainty && (
        <div className="space-y-1.5">
          <MicroLabel>Uncertainty</MicroLabel>
          <p className="text-[0.98rem] leading-[1.7] text-muted-foreground whitespace-pre-wrap border-l-2 border-dashed border-border pl-4">
            {effective.uncertainty}
          </p>
        </div>
      )}

      {effective.supporting_context_ids.length > 0 && (
        <div className="space-y-2.5">
          <MicroLabel>Grounded in</MicroLabel>
          <GroundedChips ids={effective.supporting_context_ids} contextById={contextById} />
        </div>
      )}

        {!decided && (
          <div className="flex flex-wrap items-center gap-3 pt-1">
            <form action={approveAction} className="contents">
              <input type="hidden" name="startupId" value={startupId} />
              <input type="hidden" name="tempId" value={draft.tempId} />
              <input type="hidden" name="category" value={draft.category} />
              <input type="hidden" name="title" value={effective.title} />
              <input type="hidden" name="content" value={effective.content} />
              <input type="hidden" name="rationale" value={effective.rationale} />
              <input type="hidden" name="uncertainty" value={effective.uncertainty ?? ""} />
              <input type="hidden" name="persistedId" value={draft.persistedId ?? ""} />
              <input
                type="hidden"
                name="supporting_context_ids"
                value={effective.supporting_context_ids.join(",")}
              />
              <AgreeButton />
            </form>
            {draft.state === "approved" && <ApprovedButton />}
            {!response && (
              <QuietButton onClick={() => setChallengeOpen((o) => !o)}>
                {challengeOpen ? "Close" : "Change direction / challenge reasoning"}
              </QuietButton>
            )}
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
        )}

        {challengeOpen && !response && !decided && (
          <form action={challengeAction} className="space-y-4 rounded-2xl border border-border/80 bg-card p-5 sm:p-6">
            <MicroLabel>Challenge the reasoning</MicroLabel>
            <p className="text-[0.95rem] leading-relaxed text-muted-foreground">
              What do you disagree with, or want the AI to reconsider?
            </p>
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
            <textarea
              name="objection"
              value={objection}
              onChange={(e) => setObjection(e.target.value)}
              rows={4}
              placeholder="I don't want us positioned only around…"
              className={fieldClass}
            />
            <div className="flex flex-wrap items-center gap-3">
              <SubmitChallengeButton disabled={objection.trim().length === 0} />
              <QuietButton onClick={() => setChallengeOpen(false)}>Cancel</QuietButton>
            </div>
            {challengeState.error && (
              <p className="text-[0.95rem] text-destructive">{challengeState.error}</p>
            )}
          </form>
        )}

        {response && (
          <div className="space-y-6 rounded-2xl border border-primary/20 bg-accent/25 p-5 sm:p-6">
            <MicroLabel>A conversation, not a verdict</MicroLabel>
            <SpeechBlock label="Current" emphasis>
              <p className="font-medium">{draft.title}</p>
              <p className="mt-1">{draft.content}</p>
            </SpeechBlock>
            <SpeechBlock label="You said">
              {response.objection ?? objection}
            </SpeechBlock>
            <SpeechBlock label="The AI's response" emphasis>
              <p>{response.acknowledgement}</p>
              <p className="mt-2">{response.resolution}</p>
            </SpeechBlock>

            {hasRevision && response.revised && (
              <div className="space-y-3 pt-2">
                <MicroLabel>Proposed</MicroLabel>
                <p className="display text-[1.25rem] leading-snug text-foreground">
                  {response.revised.title}
                </p>
                <RenderStructuredContent
                  content={response.revised.content}
                  category={draft.category}
                />
                {response.revised.rationale && (
                  <p className="text-sm leading-relaxed text-muted-foreground whitespace-pre-wrap border-l-2 border-border pl-4">
                    {resolveContextRefs(response.revised.rationale, contextById)}
                  </p>
                )}
              </div>
            )}

            <div className="flex flex-wrap items-center gap-3">
              {hasRevision && (
                <button
                  type="button"
                  onClick={acceptRevision}
                  className="inline-flex h-10 items-center justify-center rounded-full bg-primary px-5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
                >
                  Accept revision
                </button>
              )}
              <QuietButton onClick={() => setResponse(null)}>Keep my direction</QuietButton>
              <QuietButton
                onClick={() => {
                  setResponse(null);
                  setChallengeOpen(true);
                }}
              >
                Challenge again
              </QuietButton>
            </div>
          </div>
        )}

        {reviewError && <p className="text-[0.95rem] text-destructive">{reviewError}</p>}
    </article>
  );
}

function ActiveDecisionCard({
  decision,
  contextById,
}: {
  decision: LocalActiveDecision;
  contextById: Map<string, ContextItem>;
}) {
  const [open, setOpen] = useState(false);

  return (
    <article className="rise space-y-5 pt-8 first:pt-0">
      <div className="space-y-2">
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
          <CategoryBadge category={decision.category} tone="muted" />
          <h4 className="display text-[1.45rem] leading-snug text-foreground">
            {decision.title}
          </h4>
          <span className="eyebrow text-primary/80">Active</span>
        </div>
      </div>
      <RenderStructuredContent content={decision.content} category={decision.category} />
      {(decision.rationale || decision.supporting_context_ids.length > 0) && (
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className="group inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-primary"
        >
          {open ? "Why this decision · close" : "Why this decision"}
          <span
            aria-hidden
            className={`transition-transform duration-300 ${open ? "rotate-90" : ""}`}
          >
            ›
          </span>
        </button>
      )}
      {/* Always mounted: the disclosure grows instead of popping, so the
          decision does not jump while the founder is reading it. */}
      <div className="expand" data-open={open ? "true" : "false"}>
        <div>
          <div className="space-y-4 border-l-2 border-border/70 pl-5 sm:pl-6">
            {open && decision.rationale && (
              <div className="space-y-2 pt-5">
                <MicroLabel>Reasoning</MicroLabel>
                <p className="text-[0.98rem] leading-[1.75] text-foreground/85 whitespace-pre-wrap">
                  {resolveContextRefs(decision.rationale, contextById)}
                </p>
              </div>
            )}
            {open && decision.supporting_context_ids.length > 0 && (
              <div className="space-y-2.5 pt-5">
                <MicroLabel>Supporting context</MicroLabel>
                <GroundedChips
                  ids={decision.supporting_context_ids}
                  contextById={contextById}
                />
              </div>
            )}
          </div>
        </div>
      </div>
    </article>
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
  const [genState, dispatchGen] = useActionState(runStrategyGeneration, EMPTY_STATE);

  const [proposed, setProposed] = useState<ProposedDecisionDraft[] | null>(null);
  if (genState.proposed && proposed === null) {
    setProposed(genState.proposed);
  }
  const [activeDecisions, setActiveDecisions] = useState<LocalActiveDecision[]>(() =>
    toLocalActive(initialDecisions, initialLinks),
  );
  const [rejectedCount, setRejectedCount] = useState(initialRejectedCount);
  const [reviewErrors, setReviewErrors] = useState<Record<string, string>>({});

  const approvedByType = useMemo(() => {
    const groups: Record<"FACT" | "INFERENCE" | "HYPOTHESIS", ContextItem[]> = {
      FACT: [],
      INFERENCE: [],
      HYPOTHESIS: [],
    };
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

  const handleApproved = (
    tempId: string,
    id: string,
    draft: ProposedDecisionDraft,
  ) => {
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
      prev ? prev.map((d) => (d.tempId === tempId ? { ...d, state: "rejected" } : d)) : prev,
    );
    setRejectedCount((c) => c + 1);
    setReviewErrors((prev) => {
      if (!prev[tempId]) return prev;
      const copy = { ...prev };
      delete copy[tempId];
      return copy;
    });
  };

  const handleStaged = (tempId: string, stagedDraft: ProposedDecisionDraft) => {
    setProposed((prev) =>
      prev ? prev.map((d) => (d.tempId === tempId ? { ...d, ...stagedDraft } : d)) : prev,
    );
  };

  const allActiveCount = activeDecisions.filter((d) => d.status === "active").length;

  return (
    <section className="space-y-16 max-w-3xl">
      <div className="space-y-3">
        <p className="eyebrow">Your brand</p>
        <h2 className="display text-[2.1rem] sm:text-[2.5rem] leading-[1.1]">
          How should the world understand you?
        </h2>
        <p className="text-[0.98rem] leading-relaxed text-muted-foreground max-w-xl">
          {allActiveCount > 0
            ? `${allActiveCount} active ${allActiveCount === 1 ? "decision" : "decisions"}${
                rejectedCount > 0 ? ` · ${rejectedCount} rejected` : ""
              }. Every one of them keeps its reasoning.`
            : "Generate a strategy from the context you confirmed, then decide what to keep."}
        </p>
      </div>

      <details className="group border-y border-border/70 py-5">
        <summary className="cursor-pointer select-none marker:hidden text-sm text-muted-foreground transition-colors hover:text-foreground">
          How the brand is reasoned · {WORKFLOW_STAGES.length} specialists
        </summary>
        <ol className="mt-6 space-y-4">
          {WORKFLOW_STAGES.map((stage, idx) => (
            <li key={stage.key} className="flex items-baseline gap-4">
              <span className="eyebrow w-8 shrink-0">0{idx + 1}</span>
              <span className="min-w-0">
                <span className="text-[0.95rem] text-foreground">{stage.label}</span>
                <span className="text-[0.85rem] text-muted-foreground">
                  {" "}
                  — {stage.desc}
                </span>
              </span>
            </li>
          ))}
        </ol>
      </details>

      <div className="space-y-5">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h3 className="display text-[1.5rem]">Approved startup context</h3>
          <span className="text-[0.85rem] text-muted-foreground tabular-nums">
            {approvedContext.length} items · the only factual grounding
          </span>
        </div>
        <p className="text-[0.95rem] leading-relaxed text-muted-foreground max-w-2xl">
          Every decision is grounded in the Facts, Inferences, and Hypotheses you
          confirmed in Discovery. Your brand direction guides the AI but is never
          treated as evidence.
        </p>
        {approvedContext.length === 0 ? (
          <p className="text-[0.95rem] text-muted-foreground">
            No approved context yet. Confirm items in Discovery first.
          </p>
        ) : (
          <div className="grid gap-10 sm:grid-cols-3">
            {(["FACT", "INFERENCE", "HYPOTHESIS"] as const).map((t) => {
              const items = approvedByType[t];
              return (
                <div key={t} className="space-y-3">
                  <div className="flex items-baseline gap-2">
                    <TypeBadge type={t} />
                    <span className="text-[0.8rem] text-muted-foreground tabular-nums">
                      {items.length}
                    </span>
                  </div>
                  <ul className="space-y-2.5">
                    {items.length === 0 ? (
                      <li className="text-[0.85rem] text-muted-foreground italic">
                        None yet.
                      </li>
                    ) : (
                      items.slice(0, 3).map((c) => (
                        <li
                          key={c.id}
                          className="text-[0.85rem] leading-relaxed text-foreground/85"
                          title={c.content}
                        >
                          {c.content.length > 140 ? `${c.content.slice(0, 140)}…` : c.content}
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
          <p className="text-[0.9rem] text-muted-foreground whitespace-pre-wrap leading-relaxed">
            {genState.error}
          </p>
        )}
        {!genState.configError && genState.error && (
          <p className="text-[0.9rem] text-destructive whitespace-pre-wrap leading-relaxed">
            {genState.error}
          </p>
        )}
      </div>

      <BrandDirectionForm
        startupId={startupId}
        dispatch={dispatchGen}
        disabled={approvedContext.length === 0 || !roughIdea}
        generated={Boolean(genState.proposed)}
      />

      {proposedPending > 0 && (
        <div className="space-y-14">
          <div className="rule" />
          <div>
            <h3 className="display text-[1.7rem] sm:text-[1.95rem]">Awaiting your decision</h3>
            <p className="mt-2 text-[0.95rem] text-muted-foreground max-w-xl">
              {proposedPending} recommendation{proposedPending === 1 ? "" : "s"} from the
              AI. Nothing becomes active until you agree.
            </p>
          </div>
          {CATEGORY_GROUPS.map((group) => {
            const groupItems = group.categories
              .map((cat) => ({ cat, items: proposedByCategory.get(cat) ?? [] }))
              .filter(({ items }) => items.length > 0);
            if (groupItems.length === 0) return null;
            return (
              <div key={group.key} className="space-y-8">
                <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
                  <h4 className="display text-[1.3rem]">{group.label}</h4>
                  <span className="text-[0.85rem] text-muted-foreground">
                    {group.description}
                  </span>
                </div>
                <div className="sequence space-y-10">
                  {groupItems.flatMap(({ items }) =>
                    items.map((draft) => (
                      <ProposedDecisionCard
                        key={draft.tempId}
                        draft={draft}
                        startupId={startupId}
                        contextById={contextById}
                        reviewError={reviewErrors[draft.tempId]}
                        onApproved={handleApproved}
                        onRejected={handleRejected}
                        onStaged={handleStaged}
                      />
                    )),
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {allActiveCount > 0 && (
        <div className="space-y-14">
          <div className="rule" />
          <div>
            <h3 className="display text-[1.7rem] sm:text-[1.95rem]">Your active brand</h3>
            <p className="mt-2 text-[0.95rem] text-muted-foreground max-w-xl">
              Founder-approved. Every decision stays traceable to the context behind it.
            </p>
          </div>
          {CATEGORY_GROUPS.map((group) => {
            const groupItems = group.categories
              .map((cat) => ({ cat, items: activeByCategory.get(cat) ?? [] }))
              .filter(({ items }) => items.length > 0);
            if (groupItems.length === 0) return null;
            return (
              <div key={group.key} className="space-y-8">
                <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
                  <h4 className="display text-[1.3rem]">{group.label}</h4>
                  <span className="text-[0.85rem] text-muted-foreground">
                    {group.description}
                  </span>
                </div>
                <div className="sequence space-y-10">
                  {groupItems.flatMap(({ items }) =>
                    items.map((d) => (
                      <ActiveDecisionCard
                        key={d.id}
                        decision={d}
                        contextById={contextById}
                      />
                    )),
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
