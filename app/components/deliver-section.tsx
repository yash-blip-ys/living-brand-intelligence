"use client";

import { useEffect, useMemo, useState } from "react";
import { useQualityRuns, useStageProgress } from "@/app/components/stage-progress";
import type { BrandDecision, BrandDecisionCategory, ContextItem } from "@/lib/types/database";
import type { DecisionContextSupport } from "@/lib/db/brand-decisions";
import { resolveContextRefs } from "@/lib/context-refs";

type Props = {
  startupName: string;
  roughIdea: string;
  activeDecisions: BrandDecision[];
  decisionLinks: DecisionContextSupport[];
  approvedContext: ContextItem[];
};

type Sections = Record<string, string>;

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

function parseSections(content: string): Sections {
  const trimmed = content.trim();
  if (!trimmed.startsWith("### ")) {
    return { "": trimmed };
  }
  const parts = trimmed.split(/(?:^|\n)###\s+/);
  const out: Sections = {};
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

function byCategory(decisions: BrandDecision[], cat: BrandDecisionCategory): BrandDecision | undefined {
  return decisions.find((d) => d.status === "active" && d.category === cat);
}

function byCategorySections(decisions: BrandDecision[], cat: BrandDecisionCategory): Sections | null {
  const d = byCategory(decisions, cat);
  if (!d) return null;
  return parseSections(d.content);
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
      {children}
    </span>
  );
}

function SectionHeader({
  title,
  eyebrow,
  onCopy,
  copied,
}: {
  title: string;
  eyebrow?: string;
  onCopy: () => void;
  copied: boolean;
}) {
  return (
    <div className="flex items-end justify-between gap-4 pb-3 border-b border-border mb-4">
      <div>
        {eyebrow && <SectionLabel>{eyebrow}</SectionLabel>}
        <h3 className="text-xl font-semibold tracking-tight text-foreground mt-1">
          {title}
        </h3>
      </div>
      <button
        type="button"
        onClick={onCopy}
        className="inline-flex h-7 items-center justify-center rounded-full border border-border px-3 text-[10px] uppercase tracking-[0.18em] text-muted-foreground hover:text-foreground hover:border-muted-foreground transition-colors"
      >
        {copied ? "Copied" : "Copy section"}
      </button>
    </div>
  );
}

function SubHeading({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground mb-1.5 mt-4 first:mt-0">
      {children}
    </p>
  );
}

function RichParagraphs({ text }: { text: string }) {
  if (!text) return null;
  return (
    <div className="text-sm leading-relaxed whitespace-pre-wrap text-foreground">
      {text}
    </div>
  );
}

function Bullets({ text }: { text: string }) {
  if (!text) return null;
  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length === 0) return null;
  return (
    <ul className="space-y-1.5">
      {lines.map((l, idx) => {
        // Strip leading "- " or "N."
        const clean = l.replace(/^(-\s*|\d+\.\s*)/, "").trim();
        if (!clean) return null;
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
  );
}

function SectionBox({ children }: { children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-border bg-card text-card-foreground p-6 sm:p-8 space-y-1">
      {children}
    </section>
  );
}

function useCopy(): [Map<string, boolean>, (key: string, text: () => string) => void] {
  const [map, setMap] = useState<Map<string, boolean>>(new Map());
  const doCopy = (key: string, textFn: () => string) => {
    const text = textFn();
    if (typeof navigator === "undefined" || !navigator.clipboard) return;
    navigator.clipboard
      .writeText(text)
      .then(() => {
        setMap((prev) => {
          const n = new Map(prev);
          n.set(key, true);
          return n;
        });
        setTimeout(() => {
          setMap((prev) => {
            const n = new Map(prev);
            n.delete(key);
            return n;
          });
        }, 1400);
      })
      .catch(() => {
        /* noop */
      });
  };
  return [map, doCopy];
}

export function DeliverSection({
  startupName,
  roughIdea,
  activeDecisions,
  decisionLinks,
  approvedContext,
}: Props) {
  void decisionLinks;
  const [copiedMap, doCopy] = useCopy();

  const contextById = useMemo(() => {
    const m = new Map<string, ContextItem>();
    for (const c of approvedContext) m.set(c.id, c);
    return m;
  }, [approvedContext]);

  const activeOnly = useMemo(
    () => activeDecisions.filter((d) => d.status === "active"),
    [activeDecisions],
  );
  const aud = byCategory(activeOnly, "AUDIENCE");
  const pos = byCategory(activeOnly, "POSITIONING");
  const vp = byCategory(activeOnly, "VALUE_PROPOSITION");
  const diff = byCategory(activeOnly, "DIFFERENTIATION");
  const perSec = byCategorySections(activeOnly, "PERSONALITY");
  const namingSec = byCategorySections(activeOnly, "NAMING");
  const taglineSec = byCategorySections(activeOnly, "TAGLINE");
  const voiceSec = byCategorySections(activeOnly, "VOICE");
  const msgSec = byCategorySections(activeOnly, "MESSAGING");
  const visSec = byCategorySections(activeOnly, "VISUAL_DIRECTION");
  const launchSec = byCategorySections(activeOnly, "LAUNCH");

  const roughSentences = useMemo(() => {
    const parts = roughIdea
      .split(/(?<=[.!?])\s+/)
      .map((s) => s.trim())
      .filter(Boolean);
    return parts.slice(0, 2).join(" ");
  }, [roughIdea]);

  const oneLinePitch = msgSec ? msgSec["One-line pitch"] ?? msgSec["One-line pitch "] ?? "" : "";

  // Build Markdown kit
  const buildMarkdown = () => {
    const lines: string[] = [];
    lines.push(`# ${startupName} · Brand Kit`);
    lines.push("");
    lines.push("> Exported from Living Brand Intelligence. All decisions below are founder-approved.");
    lines.push("");
    lines.push("## Foundation");
    lines.push("");
    lines.push("### Problem");
    lines.push(roughSentences || "_Rough idea not set._");
    lines.push("");
    lines.push("### Audience");
    lines.push(aud ? aud.content : "_Pending approval in Brand tab._");
    lines.push("");
    lines.push("### Category");
    lines.push(
      pos
        ? pos.content.split("\n").slice(0, 2).join(" ").trim() || "_From Positioning decision._"
        : "_Pending approval in Brand tab._",
    );
    lines.push("");
    lines.push("## Positioning");
    lines.push("");
    lines.push("### Positioning");
    lines.push(pos?.content ?? "_Pending._");
    lines.push("");
    lines.push("### Value Proposition");
    lines.push(vp?.content ?? "_Pending._");
    lines.push("");
    lines.push("### Differentiation");
    lines.push(diff?.content ?? "_Pending._");
    lines.push("");
    lines.push("## Personality");
    for (const [k, v] of Object.entries(perSec ?? {})) {
      lines.push(`### ${k}`);
      lines.push(v);
      lines.push("");
    }
    if (!perSec) lines.push("_Pending approval in Brand tab._\n");
    lines.push("## Naming");
    for (const [k, v] of Object.entries(namingSec ?? {})) {
      lines.push(`### ${k}`);
      lines.push(v);
      lines.push("");
    }
    if (!namingSec) lines.push("_Pending._\n");
    lines.push("## Tagline");
    for (const [k, v] of Object.entries(taglineSec ?? {})) {
      lines.push(`### ${k}`);
      lines.push(v);
      lines.push("");
    }
    if (!taglineSec) lines.push("_Pending._\n");
    if (oneLinePitch) {
      lines.push("### One-line pitch");
      lines.push(oneLinePitch);
      lines.push("");
    }
    lines.push("## Voice & Messaging");
    lines.push("");
    lines.push("### Voice");
    for (const [k, v] of Object.entries(voiceSec ?? {})) {
      lines.push(`#### ${k}`);
      lines.push(v);
      lines.push("");
    }
    if (!voiceSec) lines.push("_Pending._\n");
    lines.push("### Messaging");
    for (const [k, v] of Object.entries(msgSec ?? {})) {
      if (k === "One-line pitch") continue;
      lines.push(`#### ${k}`);
      lines.push(v);
      lines.push("");
    }
    if (!msgSec) lines.push("_Pending._\n");
    lines.push("## Visual");
    for (const [k, v] of Object.entries(visSec ?? {})) {
      lines.push(`### ${k}`);
      lines.push(v);
      lines.push("");
    }
    if (!visSec) lines.push("_Pending approval in Brand tab._\n");
    lines.push("## Quality");
    lines.push("");
    lines.push("### Challenge");
    lines.push("_Run the Challenge tab to populate this section during the live demo._");
    lines.push("");
    lines.push("### Consistency");
    lines.push("_Run the Consistency Guardian in the Challenge tab._");
    lines.push("");
    lines.push("## Launch");
    for (const [k, v] of Object.entries(launchSec ?? {})) {
      lines.push(`### ${k}`);
      lines.push(v);
      lines.push("");
    }
    if (!launchSec) lines.push("_Pending approval in Brand tab._\n");
    return lines.join("\n");
  };

  const buildJson = () => {
    const kit = {
      startup: {
        name: startupName,
        rough_idea: roughIdea,
      },
      foundation: {
        problem: roughSentences || null,
        audience: aud?.content ?? null,
        category: pos
          ? pos.content.split("\n").slice(0, 2).join(" ").trim() || null
          : null,
      },
      positioning: {
        positioning: pos?.content ?? null,
        value_proposition: vp?.content ?? null,
        differentiation: diff?.content ?? null,
        competitive_angle:
          diff && pos
            ? `${pos.title} — ${diff.content.split("\n")[0] ?? ""}`.trim()
            : null,
      },
      personality: perSec ?? null,
      naming: namingSec ?? null,
      tagline: taglineSec ?? null,
      voice_messaging: {
        voice: voiceSec ?? null,
        messaging: msgSec ?? null,
      },
      visual: visSec ?? null,
      quality: {
        challenge_summary: {
          not_run: true,
          high: 0,
          medium: 0,
          low: 0,
        },
        consistency_summary: {
          not_run: true,
          pass: 0,
          needs_review: 0,
          conflict: 0,
        },
        unresolved_warnings: [] as string[],
      },
      launch: launchSec ?? null,
      meta: {
        one_line_pitch: oneLinePitch || null,
        exported_at: new Date().toISOString(),
        approved_decision_count: activeOnly.length,
      },
    };
    return JSON.stringify(kit, null, 2);
  };

  const copiedMd = copiedMap.get("md") ?? false;
  const copiedJson = copiedMap.get("json") ?? false;
  /* Derived only from the approved-decision prop so server and client render the
     same markup. Clipboard availability is handled in the copy handler, never here. */
  const canExport = activeOnly.length > 0;
  // Deliver is complete when the kit itself is valid and renderable — the same
  // condition that enables the exports and clears the empty-kit warning. It is
  // not tied to opening the tab, and a kit that cannot be built stays
  // incomplete.
  const { markCompleted } = useStageProgress();
  useEffect(() => {
    if (canExport) markCompleted("deliver");
  }, [canExport, markCompleted]);
  // Quality cards report the real Challenge-tab runs when they have happened.
  const { challengeRun, consistencyRun } = useQualityRuns();

  return (
    <section className="space-y-8">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-xs uppercase tracking-[0.18em] text-muted-foreground mb-1">
            Deliver
          </h2>
          <p className="text-sm text-muted-foreground max-w-2xl">
            Approved decisions assembled into a launch-ready brand kit. Export via
            Markdown for docs, JSON for programmatic use, or copy individual sections.
          </p>
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-card text-card-foreground p-6 sm:p-8 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div>
            <SectionLabel>Brand kit</SectionLabel>
            <h3 className="text-2xl font-semibold tracking-tight mt-1">
              {startupName}
            </h3>
            <p className="text-sm text-muted-foreground mt-1 max-w-xl">
              {activeOnly.length === 0
                ? "Brand kit is empty. Approve some active decisions in the Brand tab first."
                : `${activeOnly.length} approved decision${activeOnly.length === 1 ? "" : "s"} — ${
                    ([
                      "AUDIENCE",
                      "POSITIONING",
                      "VALUE_PROPOSITION",
                      "DIFFERENTIATION",
                      "PERSONALITY",
                    ] as BrandDecisionCategory[]).filter((c) => activeOnly.some((d) => d.category === c))
                      .length
                  } foundation, ${
                    (["NAMING", "TAGLINE", "VOICE", "MESSAGING"] as BrandDecisionCategory[]).filter(
                      (c) => activeOnly.some((d) => d.category === c),
                    ).length
                  } expression, ${
                    (["VISUAL_DIRECTION", "LAUNCH"] as BrandDecisionCategory[]).filter((c) =>
                      activeOnly.some((d) => d.category === c),
                    ).length
                  } go-to-market`}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 sm:justify-end">
            <button
              type="button"
              onClick={() => doCopy("md", buildMarkdown)}
              disabled={!canExport}
              className="inline-flex h-10 items-center justify-center rounded-full border border-foreground bg-foreground px-5 text-xs font-medium text-background hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity"
            >
              {copiedMd ? "Markdown copied" : "Copy Brand Kit (Markdown)"}
            </button>
            <button
              type="button"
              onClick={() => doCopy("json", buildJson)}
              disabled={!canExport}
              className="inline-flex h-10 items-center justify-center rounded-full border border-border bg-transparent px-5 text-xs font-medium text-foreground hover:bg-muted/40 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {copiedJson ? "JSON copied" : "Copy Brand Kit (JSON)"}
            </button>
          </div>
        </div>

        {!canExport && (
          <div className="rounded-xl border border-amber-600/40 bg-amber-500/[0.04] p-4 text-sm text-amber-700 dark:text-amber-300 space-y-2">
            There are no approved decisions yet, so there is nothing to export. Approve
            a decision in the Brand tab first.
          </div>
        )}
      </div>

      <div className="space-y-6">
        {/* 1. FOUNDATION */}
        <SectionBox>
          <SectionHeader
            eyebrow="01"
            title="Foundation"
            copied={copiedMap.get("foundation") ?? false}
            onCopy={() =>
              doCopy("foundation", () => {
                return `# Foundation\n\n## Problem\n${
                  roughSentences || "Rough idea not set."
                }\n\n## Audience\n${aud?.content ?? "_Pending._"}\n\n## Category\n${
                  pos
                    ? pos.content.split("\n").slice(0, 2).join(" ").trim()
                    : "_Pending._"
                }`;
              })
            }
          />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-2">
            <div>
              <SubHeading>Problem</SubHeading>
              <RichParagraphs text={roughSentences || "Rough idea not set yet."} />
            </div>
            <div>
              <SubHeading>Audience</SubHeading>
              <RichParagraphs
                text={aud?.content ?? "No approved AUDIENCE decision yet."}
              />
              {aud?.rationale && (
                <div className="text-[11px] leading-relaxed text-muted-foreground whitespace-pre-wrap border-l-2 border-border pl-2.5 mt-3">
                  <span className="uppercase tracking-[0.18em] mr-1.5 text-[9px]">Why</span>
                  {resolveContextRefs(aud.rationale, contextById)}
                </div>
              )}
            </div>
            <div>
              <SubHeading>Category</SubHeading>
              <RichParagraphs
                text={
                  pos
                    ? pos.content.split("\n").slice(0, 2).join(" ").trim() || pos.content
                    : "No approved POSITIONING decision yet."
                }
              />
            </div>
          </div>
        </SectionBox>

        {/* 2. POSITIONING */}
        <SectionBox>
          <SectionHeader
            eyebrow="02"
            title="Positioning"
            copied={copiedMap.get("positioning") ?? false}
            onCopy={() =>
              doCopy("positioning", () => {
                return `# Positioning\n\n## Positioning\n${
                  pos?.content ?? "_Pending._"
                }\n\n## Value Proposition\n${
                  vp?.content ?? "_Pending._"
                }\n\n## Differentiation\n${diff?.content ?? "_Pending._"}`;
              })
            }
          />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-2">
            <div>
              <SubHeading>Positioning</SubHeading>
              <RichParagraphs
                text={pos?.content ?? "No approved POSITIONING decision yet."}
              />
            </div>
            <div>
              <SubHeading>Value Proposition</SubHeading>
              <RichParagraphs
                text={
                  vp?.content ?? "No approved VALUE_PROPOSITION decision yet."
                }
              />
            </div>
            <div>
              <SubHeading>Differentiation</SubHeading>
              <RichParagraphs
                text={
                  diff?.content ?? "No approved DIFFERENTIATION decision yet."
                }
              />
            </div>
          </div>
        </SectionBox>

        {/* 3. PERSONALITY */}
        <SectionBox>
          <SectionHeader
            eyebrow="03"
            title="Personality"
            copied={copiedMap.get("personality") ?? false}
            onCopy={() =>
              doCopy("personality", () => {
                if (!perSec) return "_Personality decision pending._";
                return Object.entries(perSec)
                  .map(([k, v]) => `## ${k}\n${v}`)
                  .join("\n\n");
              })
            }
          />
          {perSec ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
              {"Traits" in perSec && (
                <div>
                  <SubHeading>Traits</SubHeading>
                  <Bullets text={perSec["Traits"]} />
                </div>
              )}
              {"Traits to avoid" in perSec && (
                <div>
                  <SubHeading>Traits to avoid</SubHeading>
                  <Bullets text={perSec["Traits to avoid"]} />
                </div>
              )}
              {"Why each fits the audience" in perSec && (
                <div>
                  <SubHeading>Why each fits the audience</SubHeading>
                  <RichParagraphs text={perSec["Why each fits the audience"]} />
                </div>
              )}
              {"How each should appear" in perSec && (
                <div>
                  <SubHeading>How each should appear</SubHeading>
                  <RichParagraphs text={perSec["How each should appear"]} />
                </div>
              )}
              {Object.keys(perSec)
                .filter(
                  (k) =>
                    !["Traits", "Traits to avoid", "Why each fits the audience", "How each should appear"].includes(
                      k,
                    ),
                )
                .map((k) => (
                  <div key={k} className="md:col-span-2">
                    <SubHeading>{k}</SubHeading>
                    <RichParagraphs text={perSec[k]} />
                  </div>
                ))}
            </div>
          ) : (
            <div className="text-sm text-muted-foreground pt-2">
              No approved PERSONALITY decision yet. Generate strategy in the Brand tab and
              approve the personality decision.
            </div>
          )}
        </SectionBox>

        {/* 4. NAMING */}
        <SectionBox>
          <SectionHeader
            eyebrow="04"
            title="Naming"
            copied={copiedMap.get("naming") ?? false}
            onCopy={() =>
              doCopy("naming", () => {
                if (!namingSec) return "_Naming decision pending._";
                return Object.entries(namingSec)
                  .map(([k, v]) => `## ${k}\n${v}`)
                  .join("\n\n");
              })
            }
          />
          {namingSec ? (
            <div className="space-y-4 pt-2">
              {Object.entries(namingSec).map(([k, v]) => (
                <div key={k}>
                  <SubHeading>{k}</SubHeading>
                  {k.toLowerCase().includes("principle") ||
                  k.toLowerCase().includes("avoid") ||
                  k.toLowerCase().includes("risk") ? (
                    <Bullets text={v} />
                  ) : (
                    <RichParagraphs text={v} />
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="text-sm text-muted-foreground pt-2">
              No approved NAMING decision yet.
            </div>
          )}
        </SectionBox>

        {/* 5. TAGLINE */}
        <SectionBox>
          <SectionHeader
            eyebrow="05"
            title="Tagline"
            copied={copiedMap.get("tagline") ?? false}
            onCopy={() =>
              doCopy("tagline", () => {
                const parts: string[] = [];
                if (taglineSec) {
                  for (const [k, v] of Object.entries(taglineSec)) {
                    parts.push(`## ${k}\n${v}`);
                  }
                }
                if (oneLinePitch) parts.push(`## One-line pitch\n${oneLinePitch}`);
                return parts.length === 0 ? "_Tagline decision pending._" : parts.join("\n\n");
              })
            }
          />
          <div className="space-y-4 pt-2">
            {taglineSec ? (
              Object.entries(taglineSec).map(([k, v]) => (
                <div key={k}>
                  <SubHeading>{k}</SubHeading>
                  <RichParagraphs text={v} />
                </div>
              ))
            ) : (
              <div className="text-sm text-muted-foreground">
                No approved TAGLINE decision yet.
              </div>
            )}
            {oneLinePitch && (
              <div className="border-t border-border pt-4">
                <SubHeading>One-line pitch</SubHeading>
                <RichParagraphs text={oneLinePitch} />
              </div>
            )}
          </div>
        </SectionBox>

        {/* 6. VOICE + MESSAGING */}
        <SectionBox>
          <SectionHeader
            eyebrow="06"
            title="Voice & Messaging"
            copied={copiedMap.get("voice_messaging") ?? false}
            onCopy={() =>
              doCopy("voice_messaging", () => {
                const parts: string[] = ["# Voice"];
                if (voiceSec) {
                  for (const [k, v] of Object.entries(voiceSec)) parts.push(`## ${k}\n${v}`);
                } else parts.push("_Pending._");
                parts.push("\n# Messaging");
                if (msgSec) {
                  for (const [k, v] of Object.entries(msgSec)) parts.push(`## ${k}\n${v}`);
                } else parts.push("_Pending._");
                return parts.join("\n\n");
              })
            }
          />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
            <div className="space-y-3">
              <SubHeading>Voice</SubHeading>
              {voiceSec ? (
                Object.entries(voiceSec).map(([k, v]) => (
                  <div key={k}>
                    <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground mb-1 mt-2 first:mt-0">
                      {k}
                    </p>
                    {k.toLowerCase() === "do" ||
                    k.toLowerCase() === "don't" ||
                    k.toLowerCase() === "characteristics" ? (
                      <Bullets text={v} />
                    ) : (
                      <RichParagraphs text={v} />
                    )}
                  </div>
                ))
              ) : (
                <div className="text-sm text-muted-foreground">
                  No approved VOICE decision yet.
                </div>
              )}
            </div>
            <div className="space-y-3">
              <SubHeading>Messaging</SubHeading>
              {msgSec ? (
                Object.entries(msgSec)
                  .filter(([k]) => k !== "One-line pitch")
                  .map(([k, v]) => (
                    <div key={k}>
                      <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground mb-1 mt-2 first:mt-0">
                        {k}
                      </p>
                      {k.toLowerCase().includes("supporting") ||
                      k.toLowerCase().includes("proof") ||
                      k.toLowerCase().includes("cta") ? (
                        <Bullets text={v} />
                      ) : (
                        <RichParagraphs text={v} />
                      )}
                    </div>
                  ))
              ) : (
                <div className="text-sm text-muted-foreground">
                  No approved MESSAGING decision yet.
                </div>
              )}
            </div>
          </div>
        </SectionBox>

        {/* 7. VISUAL */}
        <SectionBox>
          <SectionHeader
            eyebrow="07"
            title="Visual"
            copied={copiedMap.get("visual") ?? false}
            onCopy={() =>
              doCopy("visual", () => {
                if (!visSec) return "_Visual decision pending._";
                return Object.entries(visSec)
                  .map(([k, v]) => `## ${k}\n${v}`)
                  .join("\n\n");
              })
            }
          />
          {visSec ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
              {Object.entries(visSec).map(([k, v]) => (
                <div key={k}>
                  <SubHeading>{k}</SubHeading>
                  {k.toLowerCase().includes("avoid") || k.toLowerCase().includes("principle") ? (
                    <Bullets text={v} />
                  ) : (
                    <RichParagraphs text={v} />
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="text-sm text-muted-foreground pt-2">
              No approved VISUAL DIRECTION decision yet. Brief will appear here after
              approval in the Brand tab.
            </div>
          )}
        </SectionBox>

        {/* 8. QUALITY */}
        <SectionBox>
          <SectionHeader
            eyebrow="08"
            title="Quality"
            copied={copiedMap.get("quality") ?? false}
            onCopy={() =>
              doCopy("quality", () => {
                return (
                  "# Quality\n\n" +
                  "## Challenge\n" +
                  "_Run the Challenge tab during the live demo to populate real results._\n\n" +
                  "## Consistency\n" +
                  "_Run Consistency Guardian in the Challenge tab._\n\n" +
                  "## Unresolved warnings\n" +
                  "_None recorded._"
                );
              })
            }
          />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-2">
            <div className="rounded-xl border border-border p-5 space-y-2 bg-background/60">
              <SubHeading>Challenge results</SubHeading>
              {challengeRun === null ? (
                <>
                  <p className="text-sm text-muted-foreground">
                    Run the Challenge tab to surface defects.
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Status:{" "}
                    <span className="uppercase tracking-[0.18em]">Not run yet</span>
                  </p>
                </>
              ) : challengeRun.status === "error" ? (
                <>
                  <p className="text-sm text-muted-foreground">
                    The last Challenge run did not complete, so no result was recorded.
                  </p>
                  {challengeRun.error && (
                    <p className="text-xs text-muted-foreground whitespace-pre-wrap">
                      {challengeRun.error}
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground">
                    Status:{" "}
                    <span className="uppercase tracking-[0.18em]">Unavailable</span>
                  </p>
                </>
              ) : (
                <>
                  <p className="text-sm text-muted-foreground">
                    {challengeRun.issueCount === 0
                      ? `No issues found across ${challengeRun.checksRun} reported check${
                          challengeRun.checksRun === 1 ? "" : "s"
                        }.`
                      : `${challengeRun.issueCount} issue${
                          challengeRun.issueCount === 1 ? "" : "s"
                        } needing review — ${challengeRun.high} high, ${challengeRun.medium} medium, ${challengeRun.low} low.`}
                  </p>
                  {challengeRun.ungrounded > 0 && (
                    <p className="text-xs text-muted-foreground">
                      {challengeRun.ungrounded} check
                      {challengeRun.ungrounded === 1 ? "" : "s"} could not be grounded, so
                      no verdict was reported for{" "}
                      {challengeRun.ungrounded === 1 ? "it" : "them"}.
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground">
                    Status:{" "}
                    <span className="uppercase tracking-[0.18em]">
                      {challengeRun.issueCount === 0 ? "Complete · 0 issues" : "Complete"}
                    </span>
                  </p>
                </>
              )}
            </div>
            <div className="rounded-xl border border-border p-5 space-y-2 bg-background/60">
              <SubHeading>Consistency</SubHeading>
              {consistencyRun === null ? (
                <>
                  <p className="text-sm text-muted-foreground">
                    Run Consistency Guardian in the Challenge tab.
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Status:{" "}
                    <span className="uppercase tracking-[0.18em]">Not run yet</span>
                  </p>
                </>
              ) : consistencyRun.status === "error" ? (
                <>
                  <p className="text-sm text-muted-foreground">
                    The last Consistency run did not complete, so no result was recorded.
                  </p>
                  {consistencyRun.error && (
                    <p className="text-xs text-muted-foreground whitespace-pre-wrap">
                      {consistencyRun.error}
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground">
                    Status:{" "}
                    <span className="uppercase tracking-[0.18em]">Unavailable</span>
                  </p>
                </>
              ) : (
                <>
                  <p className="text-sm text-muted-foreground">
                    {consistencyRun.total} decision pair
                    {consistencyRun.total === 1 ? "" : "s"} checked —{" "}
                    {consistencyRun.pass} pass, {consistencyRun.needsReview} need
                    {consistencyRun.needsReview === 1 ? "s" : ""} review,{" "}
                    {consistencyRun.insufficientEvidence} with insufficient evidence
                    {consistencyRun.notChecked > 0
                      ? `, ${consistencyRun.notChecked} not checkable`
                      : ""}
                    .
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Status:{" "}
                    <span className="uppercase tracking-[0.18em]">Complete</span>
                  </p>
                </>
              )}
            </div>
            <div className="rounded-xl border border-border p-5 space-y-2 bg-background/60">
              <SubHeading>Unresolved warnings</SubHeading>
              <ul className="space-y-1">
                {activeOnly.length === 0 && (
                  <li className="text-sm text-foreground/80 pl-4 relative">
                    <span className="absolute left-0 text-foreground/30">·</span>
                    Brand kit has no approved decisions yet.
                  </li>
                )}
                {!visSec && (
                  <li className="text-sm text-foreground/80 pl-4 relative">
                    <span className="absolute left-0 text-foreground/30">·</span>
                    No Visual Direction decision approved.
                  </li>
                )}
                {!launchSec && (
                  <li className="text-sm text-foreground/80 pl-4 relative">
                    <span className="absolute left-0 text-foreground/30">·</span>
                    Launch copy is missing.
                  </li>
                )}
                {activeOnly.length > 0 && visSec && launchSec && (
                  <li className="text-sm text-emerald-700 dark:text-emerald-300 pl-4 relative">
                    <span className="absolute left-0 text-emerald-700/60">✓</span>
                    No unresolved warnings for available decisions.
                  </li>
                )}
              </ul>
            </div>
          </div>
        </SectionBox>

        {/* 9. LAUNCH */}
        <SectionBox>
          <SectionHeader
            eyebrow="09"
            title="Launch"
            copied={copiedMap.get("launch") ?? false}
            onCopy={() =>
              doCopy("launch", () => {
                if (!launchSec) return "_Launch decision pending._";
                return Object.entries(launchSec)
                  .map(([k, v]) => `## ${k}\n${v}`)
                  .join("\n\n");
              })
            }
          />
          {launchSec ? (
            <div className="space-y-4 pt-2">
              {"Landing page headline" in launchSec && (
                <div className="rounded-xl border border-border p-5 bg-background/60 space-y-1">
                  <SubHeading>Landing page · Hero headline</SubHeading>
                  <p className="text-xl font-semibold tracking-tight leading-snug text-foreground">
                    {launchSec["Landing page headline"]}
                  </p>
                </div>
              )}
              {"Subheadline" in launchSec && (
                <div className="rounded-xl border border-border p-5 bg-background/60 space-y-1">
                  <SubHeading>Hero subheadline</SubHeading>
                  <RichParagraphs text={launchSec["Subheadline"]} />
                </div>
              )}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {"Primary CTA" in launchSec && (
                  <div>
                    <SubHeading>Primary CTA</SubHeading>
                    <RichParagraphs text={launchSec["Primary CTA"]} />
                  </div>
                )}
                {"Short product description" in launchSec && (
                  <div>
                    <SubHeading>Short product description</SubHeading>
                    <RichParagraphs text={launchSec["Short product description"]} />
                  </div>
                )}
              </div>
              {"LinkedIn / social launch copy" in launchSec && (
                <div className="rounded-xl border border-border p-5 sm:p-6 bg-background/60">
                  <SubHeading>LinkedIn / social launch copy</SubHeading>
                  <div className="text-sm leading-relaxed whitespace-pre-wrap text-foreground pt-1 font-serif">
                    {launchSec["LinkedIn / social launch copy"]}
                  </div>
                </div>
              )}
              {Object.keys(launchSec)
                .filter(
                  (k) =>
                    ![
                      "Landing page headline",
                      "Subheadline",
                      "Primary CTA",
                      "Short product description",
                      "LinkedIn / social launch copy",
                    ].includes(k),
                )
                .map((k) => (
                  <div key={k}>
                    <SubHeading>{k}</SubHeading>
                    <RichParagraphs text={launchSec[k]} />
                  </div>
                ))}
            </div>
          ) : (
            <div className="text-sm text-muted-foreground pt-2">
              No approved LAUNCH decision yet. Approve the Launch category in the Brand
              tab to fill landing headline, CTA, and social copy.
            </div>
          )}
        </SectionBox>
      </div>

      <p className="text-center text-[10px] uppercase tracking-[0.18em] text-muted-foreground pt-4">
        {CATEGORY_LABEL.AUDIENCE} · {CATEGORY_LABEL.POSITIONING} · {CATEGORY_LABEL.PERSONALITY}{" "}
        · {CATEGORY_LABEL.NAMING} · {CATEGORY_LABEL.TAGLINE} · {CATEGORY_LABEL.VOICE} ·{" "}
        {CATEGORY_LABEL.MESSAGING} · {CATEGORY_LABEL.VISUAL_DIRECTION} ·{" "}
        {CATEGORY_LABEL.LAUNCH}
      </p>
    </section>
  );
}
