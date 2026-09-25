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
export type ChallengeRunSummary = {
  status: "complete" | "error";
  /** Reviewable findings, exactly as the run returned them. */
  issueCount: number;
  high: number;
  medium: number;
  low: number;
  /** Total checks the critic reported, including passes. */
  checksRun: number;
  /** Checks that could not be grounded, so no verdict was reported. */
  ungrounded: number;
  error?: string;
};

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
 * Stages backed by persisted founder output (Discovery, Brand, Evolution) are
 * seeded from the server. A stage whose completion is an event rather than a
 * row — Challenge — marks itself complete here, so the tab badge and the
 * header counter read the same state instead of each keeping its own.
 *
 * The run summaries are a projection of the state the runs already produce:
 * ChallengeSection remains the only owner of that state and publishes it, so
 * the Quality cards in Deliver report what happened rather than a placeholder.
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
  children,
}: {
  initial?: StageCompletion;
  children: ReactNode;
}) {
  const [completed, setCompleted] = useState<StageCompletion>(initial ?? {});
  const [challengeRun, setChallengeRun] = useState<ChallengeRunSummary | null>(null);
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
