"use client";

import { useState, type ReactNode } from "react";
import {
  useStageProgress,
  type StageCompletion,
  type StageKey,
} from "@/app/components/stage-progress";

export type WorkspaceTabKey =
  | "overview"
  | "discovery"
  | "strategy"
  | "challenge"
  | "deliver"
  | "evolution";

export type { StageKey };

const STAGES: Array<{ key: StageKey; label: string; hint: string }> = [
  { key: "discovery", label: "Discover", hint: "Understand the startup" },
  { key: "strategy", label: "Brand", hint: "Make strategic decisions" },
  { key: "challenge", label: "Challenge", hint: "Stress-test the brand" },
  { key: "deliver", label: "Deliver", hint: "Package the system" },
  { key: "evolution", label: "Evolution", hint: "Adapt when reality changes" },
];

export function WorkspaceTabs({
  defaultTab,
  slots,
  completed: completedProp = {},
}: {
  defaultTab?: WorkspaceTabKey;
  slots: Record<WorkspaceTabKey, ReactNode>;
  /** Which stages already have founder-approved output behind them. */
  completed?: StageCompletion;
}) {
  const [tab, setTab] = useState<WorkspaceTabKey>(defaultTab ?? "overview");
  // The prop seeds the stages backed by persisted work; the shared signal
  // carries stages whose completion is an event, so both read one state.
  const { completed: progressCompleted } = useStageProgress();
  const completed: StageCompletion = { ...completedProp, ...progressCompleted };

  const activeStage: StageKey =
    tab === "overview" ? "discovery" : (tab as StageKey);
  const stagesDone = STAGES.filter((s) => completed[s.key]).length;
  const currentIndex = STAGES.findIndex((s) => s.key === activeStage);

  const statusFor = (index: number, key: StageKey) => {
    if (completed[key]) return "done" as const;
    if (index === currentIndex) return "current" as const;
    return "upcoming" as const;
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => setTab("overview")}
          className={`text-sm transition-colors ${
            tab === "overview"
              ? "text-foreground font-medium"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          Overview
        </button>
        <span className="text-sm text-muted-foreground">
          Stage {Math.min(currentIndex + 1, STAGES.length)} of {STAGES.length} ·{" "}
          {stagesDone} complete
        </span>
      </div>

      <nav className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-5 gap-3" aria-label="Workspace stages">
        {STAGES.map((stage, index) => {
          const status = statusFor(index, stage.key);
          const active = tab === stage.key;
          const marker =
            status === "done" ? "✓" : status === "current" ? "●" : "○";
          return (
            <button
              type="button"
              key={stage.key}
              onClick={() => setTab(stage.key)}
              aria-current={active ? "step" : undefined}
              className={`group flex flex-col items-start gap-1 rounded-2xl border px-4 py-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/30 ${
                active
                  ? "border-foreground bg-foreground text-background"
                  : status === "current"
                    ? "border-foreground/40 bg-card hover:border-foreground/70"
                    : "border-border bg-card/60 hover:border-foreground/30"
              }`}
            >
              <span
                className={`flex items-center gap-2 text-xs font-medium uppercase tracking-wider ${
                  active ? "text-background/80" : "text-muted-foreground"
                }`}
              >
                <span aria-hidden>{marker}</span>
                0{index + 1}
              </span>
              <span
                className={`text-[17px] font-semibold tracking-tight ${
                  active ? "text-background" : "text-foreground"
                }`}
              >
                {stage.label}
              </span>
              <span
                className={`text-sm leading-snug ${
                  active ? "text-background/70" : "text-muted-foreground"
                }`}
              >
                {stage.hint}
              </span>
            </button>
          );
        })}
      </nav>

      <div className="min-h-[60vh]">
        {(["overview", ...STAGES.map((s) => s.key)] as WorkspaceTabKey[]).map((key) => (
          <div key={key} hidden={tab !== key}>
            {slots[key]}
          </div>
        ))}
      </div>
    </div>
  );
}
