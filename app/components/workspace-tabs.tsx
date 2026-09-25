"use client";

import { useState, type ReactNode } from "react";

export type WorkspaceTabKey =
  | "overview"
  | "discovery"
  | "strategy"
  | "challenge"
  | "deliver"
  | "evolution";

const TABS: Array<{ key: WorkspaceTabKey; label: string; hint: string }> = [
  { key: "overview", label: "Overview", hint: "Read-only summary" },
  { key: "discovery", label: "Discover", hint: "Facts · Inferences · Hypotheses" },
  { key: "strategy", label: "Brand", hint: "Active brand system" },
  { key: "challenge", label: "Challenge", hint: "Critique · Consistency" },
  { key: "deliver", label: "Deliver", hint: "Export brand kit" },
  { key: "evolution", label: "Evolution", hint: "Detect drift & adapt" },
];

export function WorkspaceTabs({
  defaultTab,
  slots,
}: {
  defaultTab?: WorkspaceTabKey;
  slots: Record<WorkspaceTabKey, ReactNode>;
}) {
  const [tab, setTab] = useState<WorkspaceTabKey>(defaultTab ?? "overview");

  return (
    <div className="space-y-8">
      <nav className="rounded-full border border-border bg-card/60 p-1 flex flex-wrap gap-1">
        {TABS.map((t) => {
          const active = tab === t.key;
          return (
            <button
              type="button"
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex-1 min-w-[120px] flex items-center justify-center flex-col rounded-full px-3 py-2 text-left sm:px-4 sm:py-2.5 transition-colors ${
                active
                  ? "bg-foreground text-background"
                  : "hover:bg-muted/40 text-muted-foreground"
              }`}
            >
              <span
                className={`text-[11px] sm:text-xs font-medium tracking-tight ${active ? "text-background" : "text-foreground/90"}`}
              >
                {t.label}
              </span>
              <span
                className={`text-[9px] sm:text-[10px] uppercase tracking-[0.18em] ${active ? "text-background/70" : "text-muted-foreground"}`}
              >
                {t.hint}
              </span>
            </button>
          );
        })}
      </nav>
      <div className="min-h-[60vh]">
        {TABS.map((t) => (
          <div
            key={t.key}
            hidden={tab !== t.key}
            className={`${tab === t.key ? "block" : "hidden"}`}
          >
            {slots[t.key]}
          </div>
        ))}
      </div>
    </div>
  );
}
