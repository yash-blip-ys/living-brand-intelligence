"use client";

import Link from "next/link";
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import {
  useStageProgress,
  type StageCompletion,
  type StageKey,
} from "@/app/components/stage-progress";
import { BrandMark } from "@/app/components/brand-mark";

export type WorkspaceTabKey =
  | "overview"
  | "discovery"
  | "strategy"
  | "challenge"
  | "deliver"
  | "evolution";

export type { StageKey };

type StageDefinition = {
  key: StageKey;
  label: string;
  /** The one line that tells the founder what this stage is for. */
  description: string;
};

const STAGES: StageDefinition[] = [
  {
    key: "discovery",
    label: "Discover",
    description: "We understand your startup.",
  },
  {
    key: "strategy",
    label: "Brand",
    description:
      "Shape the decisions that define how your startup is understood.",
  },
  {
    key: "challenge",
    label: "Challenge",
    description: "Don't agree with the AI just because it sounds confident.",
  },
  {
    key: "deliver",
    label: "Deliver",
    description: "Your decisions become a coherent brand.",
  },
  {
    key: "evolution",
    label: "Evolution",
    description:
      "When your startup changes, we understand what needs to change.",
  },
];

const OVERVIEW_DESCRIPTION =
  "Everything we know about your startup, and why it looks the way it does.";

/** A completed stage settles into its check rather than popping into place. */
function DoneMark() {
  return (
    <span
      aria-hidden
      className="mt-[3px] flex h-3.5 w-3.5 shrink-0 items-center justify-center text-primary"
    >
      <svg viewBox="0 0 12 12" className="h-3.5 w-3.5" fill="none">
        <path
          d="M2.5 6.4 4.8 8.7 9.5 3.9"
          stroke="currentColor"
          strokeWidth={1.6}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="check-draw"
        />
      </svg>
    </span>
  );
}

function CurrentMark() {
  return (
    <span
      aria-hidden
      className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-primary"
    />
  );
}

function UpcomingMark() {
  return (
    <span
      aria-hidden
      className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full border border-border"
    />
  );
}

export function WorkspaceTabs({
  defaultTab,
  slots,
  completed: completedProp = {},
  startupName,
}: {
  defaultTab?: WorkspaceTabKey;
  slots: Record<WorkspaceTabKey, ReactNode>;
  /** Which stages already have founder-approved output behind them. */
  completed?: StageCompletion;
  startupName?: string;
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
  const activeDefinition =
    tab === "overview"
      ? null
      : STAGES.find((s) => s.key === activeStage) ?? null;

  const statusFor = (index: number, key: StageKey) => {
    if (completed[key]) return "done" as const;
    if (index === currentIndex) return "current" as const;
    return "upcoming" as const;
  };

  const navItems = [
    ...STAGES.map((stage, index) => ({ stage, index, key: stage.key })),
  ];

  /* The active marker travels between stages instead of being destroyed and
     recreated. Position comes from the real row geometry, so it stays correct
     when the rail rewraps. Only transform and opacity are animated. */
  const navRef = useRef<HTMLDivElement | null>(null);
  const rowRefs = useRef(new Map<StageKey, HTMLButtonElement>());
  const [indicator, setIndicator] = useState<{ y: number; height: number; on: boolean }>(
    { y: 0, height: 0, on: false },
  );

  const measureIndicator = useCallback(() => {
    const node = rowRefs.current.get(activeStage);
    const container = navRef.current;
    if (!node || !container) return;
    const top = node.offsetTop - container.offsetTop;
    setIndicator((prev) =>
      prev.on && prev.y === top && prev.height === node.offsetHeight
        ? prev
        : { y: top, height: node.offsetHeight, on: true },
    );
  }, [activeStage]);

  useLayoutEffect(() => {
    measureIndicator();
  }, [measureIndicator, completed, startupName, tab]);

  useEffect(() => {
    const onResize = () => measureIndicator();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [measureIndicator]);

  const registerRow = (key: StageKey) => (node: HTMLButtonElement | null) => {
    if (node) rowRefs.current.set(key, node);
    else rowRefs.current.delete(key);
  };

  return (
    <div className="min-h-full lg:grid lg:grid-cols-[17rem_minmax(0,1fr)]">
      {/* Navigation rail: a calm guide, never a control panel. */}
      <aside className="hidden lg:flex lg:flex-col border-r border-border/70 bg-sidebar/40 px-8 py-10 sticky top-0 h-screen">
        <Link
          href="/"
          className="group flex items-start gap-3 focus-visible:outline-none"
          aria-label="Living Brand Intelligence — new idea"
        >
          <BrandMark
            size={26}
            className="mt-0.5 shrink-0 text-primary transition-transform duration-200 ease-out group-hover:-rotate-6"
          />
          <span className="min-w-0">
            <span className="display block text-[1.35rem] text-foreground leading-tight">
              Living Brand
              <br />
              Intelligence
            </span>
            <span className="eyebrow mt-3 normal-case tracking-normal text-muted-foreground/90 text-[0.7rem] block">
              {startupName?.trim() || "New idea"}
            </span>
          </span>
        </Link>

        <div className="rule my-8" />

        <nav
          aria-label="Workspace stages"
          className="relative flex flex-col"
          ref={navRef}
        >
          {/* One moving marker for the whole rail. It rests off-stage while the
              Overview is open, because Overview is not a stage in the loop. */}
          <span
            aria-hidden
            className="pointer-events-none absolute left-[-1.15rem] top-0 w-[2px] rounded-full bg-primary transition-[transform,height,opacity] duration-[320ms] ease-[cubic-bezier(0.22,1,0.36,1)]"
            style={{
              transform: `translate3d(0, ${indicator.y}px, 0)`,
              height: indicator.height,
              opacity: indicator.on && tab !== "overview" ? 1 : 0,
            }}
          />
          {navItems.map(({ stage, index }) => {
            const status = statusFor(index, stage.key);
            const active = tab === stage.key;
            return (
              <button
                type="button"
                key={stage.key}
                ref={registerRow(stage.key)}
                onClick={() => setTab(stage.key)}
                aria-current={active ? "step" : undefined}
                className={`group press-quiet -ml-3 flex items-start gap-3 rounded-lg px-3 py-3 text-left focus-visible:outline-none ${
                  active ? "text-foreground" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {status === "done" ? (
                  <DoneMark />
                ) : status === "current" ? (
                  <CurrentMark />
                ) : (
                  <UpcomingMark />
                )}
                <span className="min-w-0">
                  <span className="flex items-baseline gap-2">
                    <span className="text-[0.65rem] tracking-[0.18em] text-muted-foreground/70">
                      0{index + 1}
                    </span>
                    <span
                      className={`text-[1.02rem] leading-tight ${
                        active ? "font-medium" : "font-normal"
                      }`}
                    >
                      {stage.label}
                    </span>
                  </span>
                </span>
              </button>
            );
          })}
        </nav>

        <div className="mt-auto pt-10">
          <p className="eyebrow mb-2">
            {stagesDone} of {STAGES.length} complete
          </p>
          <Link
            href="/"
            className="press-quiet inline-block text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            ← Start a new idea
          </Link>
        </div>
      </aside>

      {/* Workspace */}
      <div className="min-w-0 flex flex-col">
        <header className="px-6 sm:px-10 lg:px-16 pt-10 pb-8 sm:pt-14 sm:pb-10">
          {/* Mobile navigation: the same five stages, kept reachable. */}
          <div className="lg:hidden mb-8 -mx-6 sm:-mx-10 lg:mx-0 px-6 sm:px-10 overflow-x-auto">
            <div className="flex items-center gap-2.5 mb-4">
              <BrandMark size={22} className="text-primary" />
              <span className="text-[0.95rem] text-foreground/90">
                {startupName?.trim() || "Living Brand Intelligence"}
              </span>
            </div>
            <div className="flex items-center gap-1 min-w-max pb-1">
              <button
                type="button"
                onClick={() => setTab("overview")}
                className={`press-quiet px-3 py-1.5 text-sm rounded-full transition-colors ${
                  tab === "overview"
                    ? "bg-foreground text-background"
                    : "text-muted-foreground"
                }`}
              >
                Overview
              </button>
              {STAGES.map((stage, index) => (
                <button
                  type="button"
                  key={stage.key}
                  onClick={() => setTab(stage.key)}
                  className={`press-quiet px-3 py-1.5 text-sm rounded-full transition-colors ${
                    tab === stage.key
                      ? "bg-foreground text-background"
                      : "text-muted-foreground"
                  }`}
                >
                  <span className="text-[0.65rem] opacity-60 mr-1.5">
                    0{index + 1}
                  </span>
                  {stage.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-3">
            <div className="min-w-0">
              <p className="eyebrow mb-3">
                {tab === "overview"
                  ? "Overview"
                  : `Stage ${String(currentIndex + 1).padStart(2, "0")} · ${activeDefinition?.label}`}
              </p>
              <h1
                key={tab}
                className="display text-[2.1rem] sm:text-[2.6rem] text-foreground stage-enter"
              >
                {tab === "overview" ? "Your brand, so far" : activeDefinition?.label}
              </h1>
              <p className="mt-3 max-w-xl text-[0.98rem] leading-relaxed text-muted-foreground">
                {tab === "overview" ? OVERVIEW_DESCRIPTION : activeDefinition?.description}
              </p>
            </div>
            <p className="hidden text-xs text-muted-foreground/80 sm:block tabular-nums">
              {stagesDone} of {STAGES.length} stages complete
            </p>
          </div>
        </header>

        <div className="px-6 sm:px-10 lg:px-16 pb-24 min-h-[60vh]">
          {/* Every slot stays mounted: switching stages must never discard work
              in progress. The entrance animation re-runs because the panel goes
              from display:none to visible, not because the subtree remounts. */}
          {(["overview", ...STAGES.map((s) => s.key)] as WorkspaceTabKey[]).map(
            (key) => (
              <div key={key} hidden={tab !== key} className="stage-enter">
                {slots[key]}
              </div>
            ),
          )}
        </div>
      </div>
    </div>
  );
}
