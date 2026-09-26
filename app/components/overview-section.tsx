"use client";

import { useMemo } from "react";
import type { BrandDecision, ChangeAnalysis, ContextItem } from "@/lib/types/database";
import type { DecisionContextSupport } from "@/lib/db/brand-decisions";

type Props = {
  startupName: string;
  roughIdea: string;
  activeContext: ContextItem[];
  activeDecisions: BrandDecision[];
  analyses: ChangeAnalysis[];
  decisionLinks: DecisionContextSupport[];
  challengeStatusLabel?: string;
  consistencyStatusLabel?: string;
};

const PRIORITY_ORDER = [
  "AUDIENCE",
  "POSITIONING",
  "VALUE_PROPOSITION",
  "DIFFERENTIATION",
  "PERSONALITY",
  "TAGLINE",
] as const;

const CATEGORY_LABEL: Record<string, string> = {
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

function parseSections(content: string): Record<string, string> {
  const trimmed = content.trim();
  if (!trimmed.startsWith("### ")) return { "": trimmed };
  const parts = trimmed.split(/(?:^|\n)###\s+/);
  const out: Record<string, string> = {};
  for (const p of parts) {
    if (!p.trim()) continue;
    const nl = p.indexOf("\n");
    if (nl === -1) out[p.trim()] = "";
    else {
      out[p.slice(0, nl).trim()] = p.slice(nl + 1).trim();
    }
  }
  return out;
}

const TYPE_LABEL: Record<string, string> = {
  FACT: "Fact",
  INFERENCE: "Inference",
  HYPOTHESIS: "Hypothesis",
};

function TypeLabel({ type }: { type: string }) {
  return <span className="eyebrow">{TYPE_LABEL[type] ?? type}</span>;
}

export function OverviewSection({
  startupName,
  roughIdea,
  activeContext,
  activeDecisions,
  analyses,
  decisionLinks,
  challengeStatusLabel = "Not run",
  consistencyStatusLabel = "Not run",
}: Props) {
  const counts = useMemo(() => {
    const c = { facts: 0, inferences: 0, hypotheses: 0 };
    for (const item of activeContext) {
      if (item.type === "FACT") c.facts += 1;
      else if (item.type === "INFERENCE") c.inferences += 1;
      else if (item.type === "HYPOTHESIS") c.hypotheses += 1;
    }
    return c;
  }, [activeContext]);

  const decisionsOnlyActive = useMemo(
    () => activeDecisions.filter((d) => d.status === "active"),
    [activeDecisions],
  );

  const decisionByCategory = useMemo(() => {
    const by = new Map<string, BrandDecision>();
    for (const d of decisionsOnlyActive) {
      if (!by.has(d.category)) by.set(d.category, d);
    }
    return by;
  }, [decisionsOnlyActive]);

  const personalityTraits = useMemo(() => {
    const p = decisionByCategory.get("PERSONALITY");
    if (!p) return [] as string[];
    const sections = parseSections(p.content);
    const raw =
      sections["Traits"] ??
      sections["Traits "] ??
      Object.values(sections).filter(Boolean)[0] ??
      "";
    if (!raw) return [];
    return raw
      .split("\n")
      .map((l) => l.replace(/^(-\s*|\d+\.\s*)/, "").trim())
      .filter(Boolean)
      .slice(0, 5);
  }, [decisionByCategory]);

  const pending = analyses.filter((a) => a.status === "pending").length;
  const recent = [...analyses].sort(
    (a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? ""),
  )[0];

  const priorityDecisions = useMemo(() => {
    return PRIORITY_ORDER.map((cat) => decisionByCategory.get(cat)).filter(
      (d): d is BrandDecision => Boolean(d),
    );
  }, [decisionByCategory]);

  const linksByDecision = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const l of decisionLinks) {
      const arr = m.get(l.decision_id) ?? [];
      arr.push(l.context_item_id);
      m.set(l.decision_id, arr);
    }
    return m;
  }, [decisionLinks]);

  const contextById = useMemo(() => {
    const m = new Map<string, ContextItem>();
    for (const c of activeContext) m.set(c.id, c);
    return m;
  }, [activeContext]);

  return (
    <section className="space-y-20 max-w-3xl">
      {/* The startup, stated plainly. */}
      <div>
        <p className="eyebrow mb-4">Startup</p>
        <h2 className="display text-[2.4rem] sm:text-[3rem] leading-[1.05]">
          {startupName || "Untitled startup"}
        </h2>
        {roughIdea && (
          <p className="mt-8 text-[1.15rem] sm:text-[1.25rem] leading-[1.65] text-foreground/90 font-[var(--font-serif)] italic">
            {roughIdea}
          </p>
        )}
        <p className="mt-10 text-sm text-muted-foreground tabular-nums">
          {counts.facts} {counts.facts === 1 ? "fact" : "facts"} ·{" "}
          {counts.inferences} {counts.inferences === 1 ? "inference" : "inferences"} ·{" "}
          {counts.hypotheses} {counts.hypotheses === 1 ? "hypothesis" : "hypotheses"} ·{" "}
          {decisionsOnlyActive.length} active{" "}
          {decisionsOnlyActive.length === 1 ? "decision" : "decisions"}
        </p>
      </div>

      <div className="rule" />

      {/* The brand as a set of decisions, read like a document. */}
      <div className="space-y-12">
        <div>
          <p className="eyebrow mb-3">The brand so far</p>
          <h3 className="display text-[1.6rem] sm:text-[1.9rem] max-w-2xl leading-snug">
            {priorityDecisions.length === 0
              ? "No brand decisions have been approved yet."
              : "What you have decided, and what it says about you."}
          </h3>
        </div>

        {priorityDecisions.length === 0 ? (
          <p className="text-sm leading-relaxed text-muted-foreground max-w-xl">
            Open the Brand stage to turn your approved context into grounded
            decisions. Nothing is decided until you say so.
          </p>
        ) : (
          <div className="stagger space-y-12">
            {priorityDecisions.map((d) => {
              const ids = linksByDecision.get(d.id) ?? [];
              const support = ids
                .map((id) => contextById.get(id))
                .filter(Boolean) as ContextItem[];
              return (
                <article key={d.id} className="space-y-4">
                  <div className="flex items-baseline gap-4">
                    <p className="eyebrow w-40 shrink-0">
                      {CATEGORY_LABEL[d.category] ?? d.category}
                    </p>
                    <h4 className="display text-[1.35rem] leading-snug">
                      {d.title}
                    </h4>
                  </div>
                  <div className="sm:pl-56 space-y-4">
                    <p className="text-[0.98rem] leading-[1.75] whitespace-pre-wrap text-foreground/90">
                      {d.content}
                    </p>
                    {support.length > 0 && (
                      <div className="space-y-2 pt-1">
                        <p className="eyebrow">Grounded in</p>
                        <ul className="space-y-1.5">
                          {support.map((c) => (
                            <li
                              key={c.id}
                              className="text-[0.82rem] leading-relaxed text-muted-foreground flex gap-2"
                            >
                              <TypeLabel type={c.type} />
                              <span className="min-w-0">{c.content}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>

      <div className="rule" />

      {/* How the brand is being held to account. */}
      <div className="grid gap-10 sm:grid-cols-3">
        <div className="space-y-3">
          <p className="eyebrow">Challenge</p>
          <p className="text-sm leading-relaxed">{challengeStatusLabel}</p>
          <p className="text-[0.82rem] leading-relaxed text-muted-foreground">
            Stress-tests the brand for clichés, weak claims, and contradictions.
          </p>
        </div>
        <div className="space-y-3">
          <p className="eyebrow">Consistency</p>
          <p className="text-sm leading-relaxed">{consistencyStatusLabel}</p>
          <p className="text-[0.82rem] leading-relaxed text-muted-foreground">
            Cross-checks nine decision pairs, from audience to positioning to
            voice.
          </p>
        </div>
        <div className="space-y-3">
          <p className="eyebrow">Evolution</p>
          <p className="text-sm leading-relaxed">
            {pending > 0
              ? `${pending} ${pending === 1 ? "analysis" : "analyses"} waiting for your review`
              : "No changes waiting"}
          </p>
          <p className="text-[0.82rem] leading-relaxed text-muted-foreground">
            {recent
              ? `Last reviewed: ${recent.summary}`
              : "When you learn something new, we show which decisions it affects."}
          </p>
        </div>
      </div>

      <div className="rule" />

      {/* The context itself, in three registers. */}
      <div className="space-y-8">
        <p className="eyebrow">What we know</p>
        {activeContext.length === 0 ? (
          <p className="text-sm leading-relaxed text-muted-foreground max-w-xl">
            Nothing confirmed yet. Discovery turns your rough idea into facts,
            inferences, and hypotheses you can approve one by one.
          </p>
        ) : (
          <div className="grid gap-10 sm:grid-cols-3">
            {(["FACT", "INFERENCE", "HYPOTHESIS"] as const).map((t) => {
              const items = activeContext.filter((c) => c.type === t);
              const shown = items.slice(0, 3);
              return (
                <div key={t} className="space-y-4">
                  <div className="flex items-baseline gap-2">
                    <TypeLabel type={t} />
                    {items.length > 3 && (
                      <span className="text-[0.7rem] text-muted-foreground/80">
                        +{items.length - 3} more
                      </span>
                    )}
                  </div>
                  {shown.length === 0 ? (
                    <p className="text-[0.82rem] text-muted-foreground italic">
                      None yet.
                    </p>
                  ) : (
                    <ul className="space-y-3">
                      {shown.map((c) => (
                        <li
                          key={c.id}
                          className="text-[0.85rem] leading-relaxed text-foreground/85"
                        >
                          {c.content.length > 120
                            ? `${c.content.slice(0, 120)}…`
                            : c.content}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {personalityTraits.length > 0 && (
        <>
          <div className="rule" />
          <div className="space-y-4">
            <p className="eyebrow">Personality</p>
            <ul className="flex flex-wrap gap-x-6 gap-y-2">
              {personalityTraits.map((t, i) => (
                <li
                  key={i}
                  className="text-[0.95rem] text-foreground/85 before:content-['—'] before:mr-2 before:text-muted-foreground/60"
                >
                  {t}
                </li>
              ))}
            </ul>
          </div>
        </>
      )}
    </section>
  );
}
