import Link from "next/link";

export default function NotFound() {
  return (
    <div className="min-h-full flex-1 flex flex-col items-center justify-center bg-zinc-50 dark:bg-black px-6 py-20">
      <div className="w-full max-w-md text-center">
        <p className="text-xs uppercase tracking-widest text-muted-foreground mb-3">
          404
        </p>
        <h1 className="text-2xl font-semibold text-foreground mb-2">
          Startup not found
        </h1>
        <p className="text-muted-foreground mb-8">
          This workspace does not exist or the link may have changed.
        </p>
        <Link
          href="/"
          className="inline-flex h-10 items-center justify-center rounded-full bg-primary px-6 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          Start a new idea
        </Link>
      </div>
    </div>
  );
}
