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
    HYPOTHESIS: "bg-transparent text-muted-foreground border-dashed border-border",
  };
  return (
    <span
      className={`inline-flex items-center text-xs font-medium px-2 py-0.5 rounded-full border ${styles[type]}`}
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
      className={`inline-flex items-center text-xs font-medium px-2.5 py-0.5 rounded-full border ${
        tone === "muted"
          ? "border-border text-muted-foreground"
          : "border-foreground/30 text-foreground"
      }`}
    >
      {CATEGORY_LABEL[category]}
    </span>
  );
}

function MicroLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
      {children}
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
      <p className="text-[16px] leading-relaxed text-foreground whitespace-pre-wrap">
        {content}
      </p>
    );
  }
  const sections = parseSections(content);
  const keys = Object.keys(sections);
  if (keys.length === 1 && keys[0] === "") {
    return (
      <p className="text-[16px] leading-relaxed text-foreground whitespace-pre-wrap">
        {sections[""]}
      </p>
    );
  }
  return (
    <div className="space-y-4">
      {Object.entries(sections).map(([k, v]) => {
        if (!v.trim() && k) {
          return (
            <p key={k} className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
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
            {k && (
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-1.5">
                {k}
              </p>
            )}
            {bullets ? (
              <ul className="space-y-1">
                {v.split("\n").map((line, idx) => {
                  const clean = line.trim().replace(/^(-\s*|\d+\.\s*|\*\s*)/, "");
                  if (!clean) return null;
                  return (
                    <li
                      key={idx}
                      className="text-[16px] leading-relaxed text-foreground/90 pl-4 relative"
                    >
                      <span className="absolute left-0 text-foreground/30">·</span>
                      {clean}
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="text-[16px] leading-relaxed text-foreground whitespace-pre-wrap">
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
  "w-full rounded-xl border border-border bg-background px-4 py-3 text-[15px] leading-relaxed text-foreground outline-none transition-colors placeholder:text-muted-foreground/70 focus:border-foreground/40 focus-visible:ring-2 focus-visible:ring-foreground/25";

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
      className={`inline-flex h-9 items-center rounded-full border px-4 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/30 ${
        selected
          ? "border-foreground bg-foreground text-background"
          : "border-border bg-transparent text-muted-foreground hover:text-foreground hover:border-foreground/40"
      }`}
    >
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
      className="inline-flex h-12 items-center justify-center rounded-full bg-foreground px-7 text-[15px] font-medium text-background transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:opacity-50 disabled:cursor-not-allowed"
    >
      {pending
        ? "Generating strategy…"
        : generated
          ? "✓ Strategy generated"
          : "Generate brand strategy"}
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
    <form action={dispatch} className="rounded-2xl border border-border bg-card text-card-foreground p-6 sm:p-8 space-y-7">
      <input type="hidden" name="startupId" value={startupId} />
      <div className="max-w-2xl space-y-2">
        <h3 className="text-2xl font-semibold tracking-tight">Shape your brand direction</h3>
        <p className="text-[16px] leading-relaxed text-muted-foreground">
          This is your intent, not evidence about the startup. It guides the AI before
          it proposes anything — it never becomes an approved Fact and never overrides
          the context you confirmed in Discovery.
        </p>
      </div>

      <fieldset className="space-y-3">
        <legend className="text-[17px] font-medium text-foreground">
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
        <legend className="text-[17px] font-medium text-foreground">
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
        <legend className="text-[17px] font-medium text-foreground">
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
        <legend className="text-[17px] font-medium text-foreground">
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
        <legend className="text-[17px] font-medium text-foreground">
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
          <span className="text-[15px] text-muted-foreground">
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
      className="inline-flex h-10 items-center justify-center rounded-full border border-foreground bg-foreground px-5 text-sm font-medium text-background transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/40 disabled:opacity-50 disabled:cursor-not-allowed"
    >
      {pending ? "Activating…" : "Agree"}
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
      className="inline-flex h-10 items-center justify-center rounded-full border border-border bg-transparent px-5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground hover:border-foreground/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/30"
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
      className="inline-flex h-10 items-center justify-center rounded-full border border-border bg-transparent px-5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground hover:border-foreground/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/30 disabled:opacity-50 disabled:cursor-not-allowed"
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
      className="inline-flex h-10 items-center justify-center rounded-full border border-foreground bg-foreground px-5 text-sm font-medium text-background transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/40 disabled:opacity-50 disabled:cursor-not-allowed"
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
    <div
      className={`rounded-xl border p-4 space-y-1 ${
        emphasis ? "border-foreground/30 bg-foreground/[0.03]" : "border-border bg-muted/20"
      }`}
    >
      <MicroLabel>{label}</MicroLabel>
      <div className="text-[15px] leading-relaxed text-foreground whitespace-pre-wrap">
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
  if (ids.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {ids.slice(0, 4).map((id) => {
        const ctx = contextById.get(id);
        if (!ctx) return null;
        const label = ctx.content.length > 90 ? `${ctx.content.slice(0, 90)}…` : ctx.content;
        return (
          <span
            key={id}
            title={ctx.content}
            className="inline-flex items-center gap-2 text-sm px-2.5 py-1 rounded-full border border-border text-muted-foreground"
          >
            <TypeBadge
              type={
                (ctx.type === "FACT" || ctx.type === "INFERENCE" || ctx.type === "HYPOTHESIS"
                  ? ctx.type
                  : "FACT") as "FACT" | "INFERENCE" | "HYPOTHESIS"
              }
            />
            <span className="max-w-[320px] truncate">{label}</span>
          </span>
        );
      })}
      {ids.length > 4 && (
        <span className="text-sm text-muted-foreground self-center">
          +{ids.length - 4} more
        </span>
      )}
    </div>
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
    <div className="rounded-2xl border border-border bg-card text-card-foreground overflow-hidden transition-colors hover:border-foreground/20">
      <div className="p-5 sm:p-7 space-y-5">
        <div className="space-y-2">
          <MicroLabel>AI recommendation</MicroLabel>
          <div className="flex flex-wrap items-center gap-3">
            <CategoryBadge category={draft.category} />
            <h4 className="text-[19px] font-semibold leading-snug text-foreground tracking-tight">
              {effective.title}
            </h4>
          </div>
        </div>

        {staged && (
          <p className="text-sm text-foreground border-l-2 border-foreground/40 pl-3">
            Staged revision — review it, then press Agree to make it active. Nothing is
            live until you do.
          </p>
        )}

        <RenderStructuredContent content={effective.content} category={draft.category} />

        {rationaleBullets.length > 0 && (
          <div className="space-y-2">
            <MicroLabel>Why I&apos;m recommending this</MicroLabel>
            <ul className="space-y-1">
              {rationaleBullets.map((line, idx) => (
                <li
                  key={idx}
                  className="text-[15px] leading-relaxed text-foreground/90 pl-4 relative"
                >
                  <span className="absolute left-0 text-foreground/30">·</span>
                  {resolveContextRefs(line, contextById)}
                </li>
              ))}
            </ul>
          </div>
        )}

        {effective.uncertainty && (
          <div className="space-y-1">
            <MicroLabel>Uncertainty</MicroLabel>
            <p className="text-[15px] leading-relaxed text-muted-foreground whitespace-pre-wrap border-l-2 border-dashed border-border pl-3">
              {effective.uncertainty}
            </p>
          </div>
        )}

        <div className="space-y-2">
          <MicroLabel>Grounded in</MicroLabel>
          <GroundedChips ids={effective.supporting_context_ids} contextById={contextById} />
        </div>

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
          <form action={challengeAction} className="space-y-3 rounded-xl border border-border p-4 sm:p-5">
            <MicroLabel>Challenge the reasoning</MicroLabel>
            <p className="text-[15px] leading-relaxed text-muted-foreground">
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
              <p className="text-[15px] text-destructive">{challengeState.error}</p>
            )}
          </form>
        )}

        {response && (
          <div className="space-y-3 rounded-xl border border-foreground/25 p-4 sm:p-5">
            <MicroLabel>AI vs founder</MicroLabel>
            <SpeechBlock label="AI suggests" emphasis>
              <p className="font-medium">{draft.title}</p>
              <p className="mt-1">{draft.content}</p>
            </SpeechBlock>
            <SpeechBlock label="Founder says">
              {response.objection ?? objection}
            </SpeechBlock>
            <SpeechBlock label="AI resolution" emphasis>
              <p>{response.acknowledgement}</p>
              <p className="mt-2">{response.resolution}</p>
            </SpeechBlock>

            {hasRevision && response.revised && (
              <div className="space-y-2 rounded-xl border border-border p-4">
                <MicroLabel>Revised recommendation</MicroLabel>
                <p className="text-[17px] font-semibold text-foreground">
                  {response.revised.title}
                </p>
                <RenderStructuredContent
                  content={response.revised.content}
                  category={draft.category}
                />
                {response.revised.rationale && (
                  <p className="text-sm leading-relaxed text-muted-foreground whitespace-pre-wrap border-l-2 border-border pl-3">
                    {resolveContextRefs(response.revised.rationale, contextById)}
                  </p>
                )}
              </div>
            )}

            <div className="flex flex-wrap items-center gap-3 pt-1">
              {hasRevision && (
                <button
                  type="button"
                  onClick={acceptRevision}
                  className="inline-flex h-10 items-center justify-center rounded-full border border-foreground bg-foreground px-5 text-sm font-medium text-background transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/40"
                >
                  Accept AI revision
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

        {reviewError && <p className="text-[15px] text-destructive">{reviewError}</p>}
      </div>
    </div>
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
    <div className="rounded-2xl border border-foreground/15 bg-card text-card-foreground overflow-hidden">
      <div className="p-5 sm:p-6 space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <CategoryBadge category={decision.category} tone="muted" />
            <h4 className="text-[19px] font-semibold leading-snug text-foreground tracking-tight">
              {decision.title}
            </h4>
            <span className="text-xs font-medium border border-foreground/25 rounded-full px-2.5 py-0.5 text-foreground">
              Active
            </span>
          </div>
          {(decision.rationale || decision.supporting_context_ids.length > 0) && (
            <button
              type="button"
              onClick={() => setOpen((o) => !o)}
              className="text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              {open ? "Hide why" : "Show why"}
            </button>
          )}
        </div>
        <RenderStructuredContent content={decision.content} category={decision.category} />
        {open && (
          <div className="space-y-3 pt-3 border-t border-border/60">
            {decision.rationale && (
              <p className="text-[15px] leading-relaxed text-muted-foreground whitespace-pre-wrap border-l-2 border-border pl-3">
                {resolveContextRefs(decision.rationale, contextById)}
              </p>
            )}
            <GroundedChips ids={decision.supporting_context_ids} contextById={contextById} />
          </div>
        )}
      </div>
    </div>
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
    <section className="space-y-10">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h3 className="text-2xl font-semibold tracking-tight text-foreground">Brand strategy</h3>
        {allActiveCount > 0 && (
          <span className="text-[15px] text-muted-foreground">
            {allActiveCount} active · {rejectedCount} rejected
          </span>
        )}
      </div>

      <details className="rounded-2xl border border-border bg-card p-5 sm:p-6">
        <summary className="cursor-pointer select-none text-[15px] font-medium text-foreground marker:text-muted-foreground/60">
          How the brand is reasoned · {WORKFLOW_STAGES.length} stages
        </summary>
        <ol className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {WORKFLOW_STAGES.map((stage, idx) => (
            <li key={stage.key} className="rounded-xl border border-border p-4 space-y-1">
              <MicroLabel>0{idx + 1}</MicroLabel>
              <p className="text-[15px] font-semibold text-foreground">{stage.label}</p>
              <p className="text-sm leading-relaxed text-muted-foreground">{stage.desc}</p>
            </li>
          ))}
        </ol>
      </details>

      <div className="rounded-2xl border border-border bg-card p-5 sm:p-7 space-y-5">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h3 className="text-2xl font-semibold tracking-tight">Approved startup context</h3>
          <span className="text-[15px] text-muted-foreground">
            {approvedContext.length} items · the only factual grounding
          </span>
        </div>
        <p className="text-[16px] leading-relaxed text-muted-foreground max-w-2xl">
          Every decision is grounded in the Facts, Inferences, and Hypotheses you
          confirmed in Discovery. Your brand direction above guides the AI but is never
          treated as evidence.
        </p>
        {approvedContext.length === 0 ? (
          <p className="text-[15px] text-muted-foreground">
            No approved context yet. Confirm items in Discovery first.
          </p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {(["FACT", "INFERENCE", "HYPOTHESIS"] as const).map((t) => {
              const items = approvedByType[t];
              return (
                <div key={t} className="space-y-2">
                  <div className="flex items-center gap-2">
                    <TypeBadge type={t} />
                    <span className="text-[15px] text-muted-foreground">{items.length}</span>
                  </div>
                  <ul className="space-y-2">
                    {items.length === 0 ? (
                      <li className="text-sm text-muted-foreground italic">None yet.</li>
                    ) : (
                      items.slice(0, 3).map((c) => (
                        <li
                          key={c.id}
                          className="rounded-lg border border-border p-3 text-sm leading-relaxed text-foreground"
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
          <p className="text-[15px] text-muted-foreground whitespace-pre-wrap leading-relaxed">
            {genState.error}
          </p>
        )}
        {!genState.configError && genState.error && (
          <p className="text-[15px] text-destructive whitespace-pre-wrap leading-relaxed">
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
        <div className="space-y-6">
          <div>
            <h3 className="text-2xl font-semibold tracking-tight">Recommendations for you</h3>
            <p className="mt-1 text-[16px] text-muted-foreground">
              {proposedPending} recommendation{proposedPending === 1 ? "" : "s"} awaiting your
              decision. Nothing becomes active until you agree.
            </p>
          </div>
          {CATEGORY_GROUPS.map((group) => {
            const groupItems = group.categories
              .map((cat) => ({ cat, items: proposedByCategory.get(cat) ?? [] }))
              .filter(({ items }) => items.length > 0);
            if (groupItems.length === 0) return null;
            return (
              <div key={group.key} className="space-y-4">
                <div className="flex flex-wrap items-baseline gap-3 border-b border-border pb-2">
                  <h4 className="text-[17px] font-semibold tracking-tight">{group.label}</h4>
                  <span className="text-[15px] text-muted-foreground">{group.description}</span>
                </div>
                <div className="space-y-3">
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
        <div className="space-y-6">
          <div>
            <h3 className="text-2xl font-semibold tracking-tight">Active brand decisions</h3>
            <p className="mt-1 text-[16px] text-muted-foreground">
              Founder-approved. Every decision stays traceable to the context behind it.
            </p>
          </div>
          {CATEGORY_GROUPS.map((group) => {
            const groupItems = group.categories
              .map((cat) => ({ cat, items: activeByCategory.get(cat) ?? [] }))
              .filter(({ items }) => items.length > 0);
            if (groupItems.length === 0) return null;
            return (
              <div key={group.key} className="space-y-4">
                <div className="flex flex-wrap items-baseline gap-3 border-b border-border pb-2">
                  <h4 className="text-[17px] font-semibold tracking-tight">{group.label}</h4>
                  <span className="text-[15px] text-muted-foreground">{group.description}</span>
                </div>
                <div className="space-y-3">
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
