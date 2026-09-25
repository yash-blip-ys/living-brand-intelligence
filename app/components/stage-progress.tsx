"use client";

import {
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type StageKey =
  | "discovery"
  | "strategy"
  | "challenge"
  | "deliver"
  | "evolution";

export type StageCompletion = Partial<Record<StageKey, boolean>>;

/** What a finished Challenge run actually returned. */
export type { ChallengeRunSummary } from "@/lib/challenge-run";
import type { ChallengeRunSummary } from "@/lib/challenge-run";

/** What a finished Consistency run actually returned. */
export type ConsistencyRunSummary = {
  status: "complete" | "error";
  total: number;
  pass: number;
  needsReview: number;
  insufficientEvidence: number;
  notChecked: number;
  error?: string;
};

type StageProgressValue = {
  completed: StageCompletion;
  markCompleted: (key: StageKey) => void;
  challengeRun: ChallengeRunSummary | null;
  publishChallengeRun: (summary: ChallengeRunSummary) => void;
  consistencyRun: ConsistencyRunSummary | null;
  publishConsistencyRun: (summary: ConsistencyRunSummary) => void;
};

/**
 * Single source of truth for stage completion, plus the real outcome of the
 * two Challenge-tab runs.
 *
 * Every stage is seeded from the server: Discovery, Brand and Evolution from
 * their persisted founder output, Challenge from the persisted run summary on
 * the startup. A run that happens in this session then publishes itself, so the
 * tick appears immediately without becoming the source of truth.
 */
const StageProgressContext = createContext<StageProgressValue>({
  completed: {},
  markCompleted: () => {},
  challengeRun: null,
  publishChallengeRun: () => {},
  consistencyRun: null,
  publishConsistencyRun: () => {},
});

function sameRun<T extends { status: string }>(prev: T | null, next: T): boolean {
  return prev !== null && JSON.stringify(prev) === JSON.stringify(next);
}

export function StageProgressProvider({
  initial,
  initialChallengeRun,
  children,
}: {
  initial?: StageCompletion;
  initialChallengeRun?: ChallengeRunSummary | null;
  children: ReactNode;
}) {
  const [completed, setCompleted] = useState<StageCompletion>(initial ?? {});
  const [challengeRun, setChallengeRun] = useState<ChallengeRunSummary | null>(
    initialChallengeRun ?? null,
  );
  const [consistencyRun, setConsistencyRun] = useState<ConsistencyRunSummary | null>(null);
  const value = useMemo<StageProgressValue>(
    () => ({
      completed,
      markCompleted: (key: StageKey) =>
        setCompleted((prev) => (prev[key] ? prev : { ...prev, [key]: true })),
      challengeRun,
      publishChallengeRun: (summary: ChallengeRunSummary) =>
        setChallengeRun((prev) => (sameRun(prev, summary) ? prev : summary)),
      consistencyRun,
      publishConsistencyRun: (summary: ConsistencyRunSummary) =>
        setConsistencyRun((prev) => (sameRun(prev, summary) ? prev : summary)),
    }),
    [completed, challengeRun, consistencyRun],
  );
  return (
    <StageProgressContext.Provider value={value}>
      {children}
    </StageProgressContext.Provider>
  );
}

export function useStageProgress(): StageProgressValue {
  return useContext(StageProgressContext);
}

/** The real outcome of the Challenge-tab runs, for the Deliver Quality cards. */
export function useQualityRuns(): Pick<
  StageProgressValue,
  "challengeRun" | "consistencyRun"
> {
  const { challengeRun, consistencyRun } = useStageProgress();
  return { challengeRun, consistencyRun };
}
