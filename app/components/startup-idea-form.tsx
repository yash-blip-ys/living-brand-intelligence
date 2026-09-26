"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import {
  createStartupAction,
  type StartupActionState,
} from "@/app/actions/startups";
import { BrandMark } from "@/app/components/brand-mark";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="press inline-flex h-11 w-full items-center justify-center gap-2.5 rounded-full bg-primary px-6 text-sm font-medium text-primary-foreground shadow-[0_1px_2px_oklch(0.4_0.06_42/0.18)] hover:brightness-[1.04] disabled:cursor-not-allowed disabled:opacity-70 sm:w-auto"
    >
      {pending ? (
        <>
          <BrandMark size={15} trace className="text-primary-foreground" />
          Creating workspace…
        </>
      ) : (
        "Start building the brand"
      )}
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
          className="field flex w-full rounded-2xl border border-input bg-card px-4 py-3.5 text-[1rem] leading-relaxed text-foreground placeholder:text-muted-foreground/60 resize-y min-h-[140px]"
        />
        <p className="text-xs text-muted-foreground">
          Don&apos;t polish it. Write what you have in mind — even a sentence
          is enough to start.
        </p>
      </div>

      {state?.error && (
        <div
          role="alert"
          className="rounded-2xl border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive"
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
