"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import {
  createStartupAction,
  type StartupActionState,
} from "@/app/actions/startups";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex h-11 w-full items-center justify-center rounded-full bg-primary px-6 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60 disabled:cursor-not-allowed transition-colors sm:w-auto"
    >
      {pending ? "Creating workspace…" : "Start building the brand"}
    </button>
  );
}

const initialState: StartupActionState | undefined = undefined;

export function StartupIdeaForm() {
  const [state, formAction] = useActionState(createStartupAction, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <label
          htmlFor="rawIdea"
          className="text-sm font-medium text-foreground"
        >
          Your rough startup idea
        </label>
        <textarea
          id="rawIdea"
          name="rawIdea"
          required
          minLength={3}
          rows={6}
          placeholder='e.g. "A platform for college students to find compatible teammates for hackathon projects."'
          className="flex w-full rounded-lg border border-input bg-background px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background resize-y min-h-[140px]"
        />
        <p className="text-xs text-muted-foreground">
          Don&apos;t polish it. Write what you have in mind — even a sentence
          is enough to start.
        </p>
      </div>

      {state?.error && (
        <div
          role="alert"
          className="rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive"
        >
          {state.error}
        </div>
      )}

      <div className="flex items-center justify-start">
        <SubmitButton />
      </div>
    </form>
  );
}
