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
      <div className="min-h-full flex-1 flex flex-col items-center justify-center px-6 py-24">
        <div className="w-full max-w-xl text-center animate-calm-reveal">
          <p className="eyebrow mb-4">Something interrupted us</p>
          <h1 className="display text-[2rem] mb-3">We could not open this workspace</h1>
          <p className="text-muted-foreground mb-8">{message}</p>
          <Link
            href="/"
            className="inline-flex h-11 items-center justify-center rounded-full bg-primary px-6 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
          >
            Go back home
          </Link>
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
    <div className="min-h-full flex-1 flex flex-col">
      <main className="flex-1">
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
          startupName={displayName}
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
    </div>
  );
}
