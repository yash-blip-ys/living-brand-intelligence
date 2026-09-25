import { StartupIdeaForm } from "./components/startup-idea-form";

export default function Home() {
  return (
    <div className="min-h-full flex-1 flex flex-col bg-zinc-50 dark:bg-black">
      <main className="flex-1 w-full">
        <div className="mx-auto w-full max-w-4xl px-6 py-20 sm:py-28">
          <div className="mb-12 sm:mb-16">
            <div className="flex items-center gap-2 mb-6">
              <span className="w-8 h-px bg-foreground/40" />
              <p className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
                Living Brand Intelligence
              </p>
            </div>
            <p className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground mb-4">
              Early-stage · MVP
            </p>
            <h1 className="text-3xl sm:text-5xl font-semibold leading-[1.1] tracking-tight text-foreground mb-6">
              Build a brand that
              <br className="hidden sm:block" />
              <span className="italic font-light">remembers why.</span>
            </h1>
            <p className="text-base sm:text-lg leading-relaxed text-muted-foreground max-w-2xl">
              A living brand intelligence system that understands what your
              startup is, traces every brand decision back to approved context,
              and evolves the brand coherently when your startup changes.
            </p>
          </div>

          <section className="rounded-2xl border border-border bg-card text-card-foreground p-6 sm:p-10 mb-16 sm:mb-20">
            <div className="mb-6 sm:mb-8">
              <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground mb-2">
                Start with a rough idea
              </p>
              <h2 className="text-xl sm:text-2xl font-semibold tracking-tight leading-snug">
                What are you building?
              </h2>
            </div>
            <StartupIdeaForm />
          </section>

          <section className="space-y-10 sm:space-y-12">
            <div>
              <div className="flex items-center gap-2 mb-6">
                <span className="w-8 h-px bg-foreground/40" />
                <p className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
                  The four-part loop
                </p>
              </div>
              <ol className="grid grid-cols-1 sm:grid-cols-2 gap-px bg-border rounded-2xl overflow-hidden border border-border">
                <li className="bg-background p-6 sm:p-8 space-y-2">
                  <div className="flex items-baseline gap-3">
                    <span className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
                      01
                    </span>
                    <h3 className="text-lg font-semibold tracking-tight">
                      Understand
                    </h3>
                  </div>
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    Turn a rough startup idea into structured Facts,
                    Inferences, and Hypotheses — each with reasoning the
                    founder reviews and approves.
                  </p>
                </li>
                <li className="bg-background p-6 sm:p-8 space-y-2">
                  <div className="flex items-baseline gap-3">
                    <span className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
                      02
                    </span>
                    <h3 className="text-lg font-semibold tracking-tight">
                      Decide
                    </h3>
                  </div>
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    Generate a complete brand system from the approved context
                    only. Every decision carries its rationale and the exact
                    supporting context it came from.
                  </p>
                </li>
                <li className="bg-background p-6 sm:p-8 space-y-2">
                  <div className="flex items-baseline gap-3">
                    <span className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
                      03
                    </span>
                    <h3 className="text-lg font-semibold tracking-tight">
                      Remember
                    </h3>
                  </div>
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    Never lose the <em>why</em>. Old decisions are superseded,
                    never deleted. The chain from previous to current remains
                    visible at every step.
                  </p>
                </li>
                <li className="bg-background p-6 sm:p-8 space-y-2">
                  <div className="flex items-baseline gap-3">
                    <span className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
                      04
                    </span>
                    <h3 className="text-lg font-semibold tracking-tight">
                      Evolve
                    </h3>
                  </div>
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    Add a new founder fact. The system flags affected decisions,
                    proposes a surgical revision, and lets the founder compare
                    Current vs Proposed before approving.
                  </p>
                </li>
              </ol>
            </div>
          </section>
        </div>
      </main>

      <footer className="border-t border-border">
        <div className="mx-auto w-full max-w-4xl px-6 py-5 text-[10px] uppercase tracking-[0.18em] text-muted-foreground flex items-center justify-between">
          <span>Living Brand Intelligence</span>
          <span>MVP · Polished</span>
        </div>
      </footer>
    </div>
  );
}
