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

function preview(content: string, max = 160): string {
  const clean = content.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  return `${clean.slice(0, max)}…`;
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
      className={`inline-flex items-center text-[9px] uppercase tracking-[0.18em] font-medium px-1.5 py-0.5 rounded-full border ${styles[type]}`}
    >
      {type}
    </span>
  );
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
    <section className="space-y-8">
      <div className="rounded-2xl border border-border bg-card text-card-foreground overflow-hidden">
        <div className="p-6 sm:p-8 border-b border-border space-y-5">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="space-y-2 max-w-2xl">
              <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                Startup
              </p>
              <h1 className="text-2xl sm:text-3xl font-semibold leading-tight tracking-tight">
                {startupName || "Untitled startup"}
              </h1>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-right">
              <Stat label="Facts" value={counts.facts} />
              <Stat label="Inferences" value={counts.inferences} />
              <Stat label="Hypotheses" value={counts.hypotheses} />
              <Stat
                label="Active decisions"
                value={decisionsOnlyActive.length}
                accent
              />
            </div>
          </div>
          {roughIdea && (
            <div className="rounded-xl border border-foreground/10 bg-background/40 p-5 space-y-1.5">
              <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                Rough idea
              </p>
              <p className="text-sm leading-relaxed text-foreground whitespace-pre-wrap">
                {roughIdea}
              </p>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-1">
            <OverviewField
              label="Audience"
              body={
                decisionByCategory.get("AUDIENCE")
                  ? preview(decisionByCategory.get("AUDIENCE")!.content, 180)
                  : undefined
              }
            />
            <OverviewField
              label="Positioning"
              body={
                decisionByCategory.get("POSITIONING")
                  ? preview(decisionByCategory.get("POSITIONING")!.content, 180)
                  : undefined
              }
            />
            <OverviewField
              label="Value proposition"
              body={
                decisionByCategory.get("VALUE_PROPOSITION")
                  ? preview(decisionByCategory.get("VALUE_PROPOSITION")!.content, 180)
                  : undefined
              }
            />
            <OverviewField
              label="Tagline"
              body={
                decisionByCategory.get("TAGLINE")
                  ? (() => {
                      const d = decisionByCategory.get("TAGLINE")!;
                      const secs = parseSections(d.content);
                      const firstWithBody =
                        Object.values(secs).find((v) => v && v.trim()) ||
                        d.content;
                      return preview(firstWithBody, 140);
                    })()
                  : undefined
              }
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
            <div className="rounded-xl border border-border p-4 bg-background/50 space-y-2">
              <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                Personality traits
              </p>
              {personalityTraits.length === 0 ? (
                <p className="text-[11px] text-muted-foreground">
                  No approved personality decision yet.
                </p>
              ) : (
                <ul className="flex flex-wrap gap-1.5 pt-0.5">
                  {personalityTraits.map((t, i) => (
                    <li
                      key={i}
                      className="inline-flex items-center rounded-full border border-foreground/20 text-[11px] px-2.5 py-0.5 text-foreground"
                    >
                      {t}
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="rounded-xl border border-border p-4 bg-background/50 space-y-2">
              <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                Challenge status
              </p>
              <p className="text-sm leading-snug text-foreground">
                {challengeStatusLabel}
              </p>
              <p className="text-[11px] leading-relaxed text-muted-foreground">
                Open the Challenge tab to detect clichés, weak claims, and
                contradictions.
              </p>
            </div>
            <div className="rounded-xl border border-border p-4 bg-background/50 space-y-2">
              <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                Consistency status
              </p>
              <p className="text-sm leading-snug text-foreground">
                {consistencyStatusLabel}
              </p>
              <p className="text-[11px] leading-relaxed text-muted-foreground">
                Runs 9 cross-check pairs: Audience ↔ Positioning, Personality ↔
                Voice, Launch ↔ Positioning and more.
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="rounded-xl border border-border p-5 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
              Brand intelligence
            </p>
            <span className="text-[10px] text-muted-foreground">
              {pending > 0 ? `${pending} pending` : "No pending changes"}
            </span>
          </div>
          <ul className="space-y-2 text-xs">
            <MetricRow label="Active facts" value={counts.facts} />
            <MetricRow label="Active inferences" value={counts.inferences} />
            <MetricRow label="Active hypotheses" value={counts.hypotheses} />
            <MetricRow label="Active brand decisions" value={decisionsOnlyActive.length} />
            <MetricRow
              label="Recent evolution analyses"
              value={analyses.length}
            />
          </ul>
        </div>

        <div className="md:col-span-2 rounded-xl border border-border p-5 space-y-3">
          <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
            Core context
          </p>
          {activeContext.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              No approved context yet. Run Discovery to convert the rough idea
              into structured Facts, Inferences, and Hypotheses.
            </p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {(["FACT", "INFERENCE", "HYPOTHESIS"] as const).map((t) => {
                const items = activeContext.filter((c) => c.type === t);
                const shown = items.slice(0, 3);
                if (shown.length === 0) {
                  return (
                    <div key={t} className="space-y-2">
                      <TypeBadge type={t} />
                      <p className="text-[11px] text-muted-foreground italic">
                        None yet.
                      </p>
                    </div>
                  );
                }
                return (
                  <div key={t} className="space-y-2">
                    <div className="flex items-center gap-2">
                      <TypeBadge type={t} />
                      {items.length > 3 && (
                        <span className="text-[10px] text-muted-foreground">
                          +{items.length - 3} more
                        </span>
                      )}
                    </div>
                    <ul className="space-y-1.5">
                      {shown.map((c) => (
                        <li
                          key={c.id}
                          className="rounded-lg border border-border px-2.5 py-1.5 text-[11px] leading-relaxed text-foreground"
                          title={c.content}
                        >
                          {c.content.length > 120
                            ? `${c.content.slice(0, 120)}…`
                            : c.content}
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-card text-card-foreground p-6 sm:p-8 space-y-5">
        <div className="flex items-center justify-between">
          <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
            Current brand
          </p>
          {priorityDecisions.length === 0 && (
            <span className="text-[10px] text-muted-foreground">
              Generate strategy first
            </span>
          )}
        </div>
        {priorityDecisions.length === 0 ? (
          <p className="text-xs leading-relaxed text-muted-foreground max-w-2xl">
            No approved brand decisions yet. Go to Strategy to turn the
            approved context into grounded decisions.
          </p>
        ) : (
          <ul className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {priorityDecisions.map((d) => {
              const ids = linksByDecision.get(d.id) ?? [];
              const supportPreview = ids
                .slice(0, 2)
                .map((id) => contextById.get(id))
                .filter(Boolean) as ContextItem[];
              return (
                <li
                  key={d.id}
                  className="rounded-xl border border-foreground/10 p-4 space-y-2 bg-background/20"
                >
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="inline-flex items-center text-[9px] uppercase tracking-[0.18em] font-medium px-2 py-0.5 rounded-full border border-foreground/20 text-foreground">
                      {CATEGORY_LABEL[d.category] ?? d.category}
                    </span>
                    <span className="text-[10px] uppercase tracking-[0.18em] border border-border rounded-full px-2 py-0.5 text-muted-foreground">
                      Active
                    </span>
                  </div>
                  <h3 className="text-sm font-semibold leading-snug">
                    {d.title}
                  </h3>
                  <p className="text-xs leading-relaxed text-foreground whitespace-pre-wrap">
                    {d.content}
                  </p>
                  {supportPreview.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {supportPreview.map((c) => (
                        <span
                          key={c.id}
                          title={c.content}
                          className="inline-flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded-full border border-border text-muted-foreground"
                        >
                          <TypeBadge
                            type={
                              (c.type === "FACT" ||
                                c.type === "INFERENCE" ||
                                c.type === "HYPOTHESIS"
                                ? c.type
                                : "FACT") as
                                | "FACT"
                                | "INFERENCE"
                                | "HYPOTHESIS"
                            }
                          />
                          <span className="max-w-[180px] truncate">
                            {c.content}
                          </span>
                        </span>
                      ))}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="rounded-xl border border-border p-5 sm:p-6 space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
            Recent evolution
          </p>
          {pending > 0 && (
            <span className="text-[10px] uppercase tracking-[0.18em] border border-foreground/20 rounded-full px-2 py-0.5 text-foreground">
              {pending} pending review
            </span>
          )}
        </div>
        {!recent ? (
          <p className="text-xs text-muted-foreground">
            No evolution analyses yet. When new founder information changes
            the startup, Evolution detects which brand decisions need review.
          </p>
        ) : (
          <div className="rounded-lg border border-border p-4 space-y-1.5 bg-background/30">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="inline-flex items-center text-[9px] uppercase tracking-[0.18em] font-medium px-2 py-0.5 rounded-full border border-border text-foreground">
                {recent.status.toUpperCase()}
              </span>
              {recent.created_at && (
                <span className="text-[10px] text-muted-foreground">
                  {new Date(recent.created_at).toLocaleString()}
                </span>
              )}
            </div>
            <p className="text-sm font-medium leading-snug">{recent.summary}</p>
            <p className="text-[11px] text-muted-foreground whitespace-pre-wrap">
              Trigger: {
                activeContext.find((c) => c.id === recent.source_context_item_id)
                  ?.content ?? "new founder input"
              }
            </p>
          </div>
        )}
      </div>
    </section>
  );
}

function Stat({
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
  accent?: boolean;
}) {
  return (
    <div className="min-w-[72px]">
      <div
        className={`text-lg font-semibold leading-none ${accent ? "text-foreground" : "text-foreground/90"}`}
      >
        {value}
      </div>
      <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground mt-1">
        {label}
      </div>
    </div>
  );
}

function OverviewField({
  label,
  body,
}: {
  label: string;
  body?: string;
}) {
  return (
    <div className="rounded-xl border border-border p-4 bg-background/50 space-y-2">
      <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
        {label}
      </p>
      {body ? (
        <p className="text-[12.5px] leading-relaxed text-foreground/90">{body}</p>
      ) : (
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          No approved decision yet.
        </p>
      )}
    </div>
  );
}

function MetricRow({ label, value }: { label: string; value: number }) {
  return (
    <li className="flex items-center justify-between text-foreground/90 py-0.5">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium tabular-nums">{value}</span>
    </li>
  );
}
