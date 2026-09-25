import Link from "next/link";
import { notFound } from "next/navigation";
import { getStartup } from "@/lib/db/startups";
import { getContextItems } from "@/lib/db/context";
import {
  getBrandDecisions,
  getDecisionContextLinks,
} from "@/lib/db/brand-decisions";
import {
  listFounderFacts,
  getChangeAnalyses,
  getChangeAnalysisImpacts,
} from "@/lib/db/evolution";
import type { BrandDecision, ContextItem } from "@/lib/types/database";
import type { ChangeAnalysis, ChangeAnalysisImpact } from "@/lib/types/database";
import type { DecisionContextSupport } from "@/lib/db/brand-decisions";
import type { FounderFactDraft } from "@/app/actions/evolution";
import { WorkspaceTabs } from "@/app/components/workspace-tabs";
import { StageProgressProvider } from "@/app/components/stage-progress";
import { parseChallengeRun } from "@/lib/challenge-run";
import { OverviewSection } from "@/app/components/overview-section";
import { DiscoverySection } from "@/app/components/discovery-section";
import { BrandStrategySection } from "@/app/components/brand-strategy-section";
import { EvolutionSection } from "@/app/components/evolution-section";
import { ChallengeSection } from "@/app/components/challenge-section";
import { DeliverSection } from "@/app/components/deliver-section";

export default async function StartupWorkspacePage({
  params,
}: {
  params: Promise<{ startupId: string }>;
}) {
  const { startupId } = await params;

  let startup;
  try {
    startup = await getStartup(startupId);
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to load startup.";
    return (
      <div className="min-h-full flex-1 flex flex-col items-center justify-center bg-zinc-50 dark:bg-black px-6 py-20">
        <div className="w-full max-w-2xl">
          <div className="rounded-xl border border-border bg-card text-card-foreground p-8 text-center">
            <h1 className="text-xl font-semibold mb-2">Could not load workspace</h1>
            <p className="text-muted-foreground mb-6">{message}</p>
            <Link
              href="/"
              className="inline-flex h-10 items-center justify-center rounded-full bg-primary px-5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              Go back home
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (!startup) {
    notFound();
  }

  let existingContext: ContextItem[] = [];
  try {
    existingContext = await getContextItems(startupId);
  } catch {
    existingContext = [];
  }

  let brandDecisions: BrandDecision[] = [];
  try {
    brandDecisions = await getBrandDecisions(startupId);
  } catch {
    brandDecisions = [];
  }

  let decisionLinks: DecisionContextSupport[] = [];
  try {
    decisionLinks = await getDecisionContextLinks(startupId);
  } catch {
    decisionLinks = [];
  }

  let founderFacts: FounderFactDraft[] = [];
  try {
    const rows = await listFounderFacts(startupId);
    founderFacts = rows.map((r) => ({
      id: r.id,
      content: r.content,
      source: r.source ?? "FOUNDER_INPUT",
      created_at: r.created_at,
      persisted: true,
    }));
  } catch {
    founderFacts = [];
  }

  let changeAnalyses: ChangeAnalysis[] = [];
  try {
    changeAnalyses = await getChangeAnalyses(startupId);
  } catch {
    changeAnalyses = [];
  }

  let changeImpacts: ChangeAnalysisImpact[] = [];
  try {
    changeImpacts = await getChangeAnalysisImpacts(startupId);
  } catch {
    changeImpacts = [];
  }

  const activeContext = existingContext.filter(
    (c) => c.status === "active" && (c.type === "FACT" || c.type === "INFERENCE" || c.type === "HYPOTHESIS")
  );
  const rejectedContext = existingContext.filter(
    (c) => c.type === "REJECTED" || c.status === "archived"
  );
  const rejectedDecisions = brandDecisions.filter((d) => d.status === "rejected").length;

  const displayName = startup.name?.trim() || "Untitled startup";
  const hasRawIdea = Boolean(startup.raw_idea?.trim());
  const roughIdeaText = startup.raw_idea?.trim() ?? "";
  // Challenge completion is the persisted run, not a client-side flag, so the
  // stage tick and the Quality cards survive a reload.
  const challengeRun = parseChallengeRun(startup.challenge_run);
  const challengeCompleted = challengeRun?.status === "complete";

  return (
    <div className="min-h-full flex-1 flex flex-col bg-zinc-50 dark:bg-black">
      <header className="border-b border-border bg-background/60 backdrop-blur">
        <div className="mx-auto w-full max-w-5xl px-6 py-4 flex items-center justify-between">
          <div className="min-w-0">
            <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground mb-1">
              Brand workspace
            </p>
            <h1 className="text-lg font-semibold tracking-tight truncate">{displayName}</h1>
          </div>
          <Link
            href="/"
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            ← New idea
          </Link>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl px-6 py-8 flex-1">
        <StageProgressProvider
          initial={{
            discovery: activeContext.length > 0,
            strategy: brandDecisions.filter((d) => d.status === "active").length > 0,
            challenge: challengeCompleted,
            deliver: false,
            evolution: changeAnalyses.length > 0,
          }}
          initialChallengeRun={challengeRun}
        >
        <WorkspaceTabs
          defaultTab="overview"
          slots={{
            overview: (
              <OverviewSection
                startupName={displayName}
                roughIdea={roughIdeaText}
                activeContext={activeContext}
                activeDecisions={brandDecisions}
                analyses={changeAnalyses}
                decisionLinks={decisionLinks}
              />
            ),
            discovery: (
              <DiscoverySection
                startupId={startupId}
                roughIdea={roughIdeaText}
                hasRawIdea={hasRawIdea}
                initialActiveContext={activeContext}
                initialRejectedCount={rejectedContext.length}
              />
            ),
            strategy: (
              <BrandStrategySection
                startupId={startupId}
                roughIdea={roughIdeaText}
                approvedContext={activeContext}
                initialDecisions={brandDecisions}
                initialLinks={decisionLinks}
                initialRejectedCount={rejectedDecisions}
              />
            ),
            challenge: (
              <ChallengeSection
                startupId={startupId}
                approvedContext={activeContext}
                activeDecisions={brandDecisions}
                decisionLinks={decisionLinks}
              />
            ),
            deliver: (
              <DeliverSection
                startupName={displayName}
                roughIdea={roughIdeaText}
                activeDecisions={brandDecisions}
                decisionLinks={decisionLinks}
                approvedContext={activeContext}
              />
            ),
            evolution: (
              <EvolutionSection
                startupId={startupId}
                initialFacts={founderFacts}
                initialAnalyses={changeAnalyses}
                initialImpacts={changeImpacts}
                activeDecisions={brandDecisions}
                approvedContext={activeContext}
                decisionContextLinks={decisionLinks}
              />
            ),
          }}
        />
        </StageProgressProvider>
      </main>

      <footer className="border-t border-border">
        <div className="mx-auto w-full max-w-5xl px-6 py-4 text-[10px] uppercase tracking-[0.18em] text-muted-foreground flex items-center justify-between">
          <span>Living Brand Intelligence</span>
          <span>MVP · Polished</span>
        </div>
      </footer>
    </div>
  );
}
