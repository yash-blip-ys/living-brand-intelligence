import { StartupIdeaForm } from "./components/startup-idea-form";
import { BrandMark } from "./components/brand-mark";
import { Reveal } from "./components/reveal";

/** The loop, in the order a founder actually walks it. */
const STORY = [
  {
    key: "rough-idea",
    step: "Rough idea",
    title: "One sentence is enough",
    body: "You arrive with a sketch, not a brand book. The workspace starts from what you can say out loud right now.",
  },
  {
    key: "understand",
    step: "Understand",
    title: "It reads you back before it decides anything",
    body: "Facts, inferences, and hypotheses — each with the reasoning attached, so you can correct what it got wrong.",
  },
  {
    key: "decide",
    step: "Decide",
    title: "Decisions you can defend",
    body: "Every brand decision is generated from approved context only, and carries the exact context it came from.",
  },
  {
    key: "remember",
    step: "Remember",
    title: "Nothing is overwritten",
    body: "When a decision changes, the previous version is superseded, never deleted. The chain stays visible at every step.",
  },
  {
    key: "challenge",
    step: "Challenge",
    title: "The AI has to show its evidence",
    body: "A critic checks your approved decisions for generic language, contradictions, and unsupported claims — and quotes the wording it rests on.",
  },
  {
    key: "evolve",
    step: "Evolve",
    title: "New fact in, precise revision out",
    body: "Add what you learned. The system shows which decisions it affects, proposes a surgical revision, and waits for you.",
  },
];

export default function Home() {
  return (
    <div className="min-h-full flex-1 flex flex-col">
      <main className="flex-1 w-full">
        <div className="mx-auto w-full max-w-4xl px-6 py-20 sm:py-28">
          <Reveal as="div" eager className="mb-16 sm:mb-20">
            <div className="flex items-center gap-3 mb-8">
              <BrandMark size={30} trace />
              <p className="eyebrow normal-case tracking-[0.18em] text-foreground/80">
                Living Brand Intelligence
              </p>
            </div>
            <h1 className="display text-[2.6rem] sm:text-[4.25rem] leading-[1.04] text-foreground mb-7">
              Build a brand that
              <br />
              <span className="text-primary italic">remembers why.</span>
            </h1>
            <p className="text-base sm:text-lg leading-relaxed text-muted-foreground max-w-2xl">
              A living brand intelligence system that understands what your
              startup is, traces every brand decision back to approved context,
              and evolves the brand coherently when your startup changes.
            </p>
          </Reveal>

          <Reveal as="section" delay={90} className="border-t border-border/70 pt-10 sm:pt-12">
            <div className="mb-6 sm:mb-8 max-w-xl">
              <p className="eyebrow mb-3">Start with a rough idea</p>
              <h2 className="display text-[1.7rem] sm:text-[2.1rem] leading-tight">
                What are you building?
              </h2>
            </div>
            <StartupIdeaForm />
          </Reveal>

          <section className="mt-20 sm:mt-28">
            <Reveal className="mb-12 max-w-xl">
              <p className="eyebrow mb-3">The loop</p>
              <h2 className="display text-[1.8rem] sm:text-[2.2rem] leading-tight">
                One idea, carried all the way through.
              </h2>
            </Reveal>

            {/* The thread is the product argument in one line: a single orange
                path running through the six steps. */}
            <div className="relative">
              <span
                aria-hidden
                className="thread-line absolute left-[7px] top-2 bottom-2 w-px sm:left-[9px]"
              />
              <ol className="space-y-12 sm:space-y-14">
                {STORY.map((item, index) => (
                  <Reveal as="li" key={item.key} delay={index * 40} className="relative pl-9 sm:pl-11">
                    <span
                      aria-hidden
                      className="absolute left-0 top-[7px] flex h-4 w-4 items-center justify-center rounded-full border border-primary/40 bg-background"
                    >
                      <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                    </span>
                    <p className="eyebrow mb-2 text-primary/90">{item.step}</p>
                    <h3 className="display text-[1.35rem] sm:text-[1.6rem] leading-snug mb-2">
                      {item.title}
                    </h3>
                    <p className="text-[0.98rem] leading-[1.7] text-muted-foreground max-w-xl">
                      {item.body}
                    </p>
                  </Reveal>
                ))}
              </ol>
            </div>
          </section>
        </div>
      </main>

      <footer className="border-t border-border">
        <div className="mx-auto w-full max-w-4xl px-6 py-6 text-[0.75rem] tracking-[0.14em] text-muted-foreground flex items-center justify-between">
          <span className="flex items-center gap-2 normal-case">
            <BrandMark size={18} className="text-primary" />
            Living Brand Intelligence
          </span>
          <span>Early-stage · MVP</span>
        </div>
      </footer>
    </div>
  );
}
