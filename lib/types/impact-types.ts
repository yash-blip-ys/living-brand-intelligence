/**
 * `change_analysis_impacts.impact_type` is constrained by
 * `change_analysis_impacts_impact_type_check` to the brand decision categories.
 * The column records WHICH kind of decision an impact lands on; the kind of
 * drift is carried by the analysis itself (summary + analysis JSON), not by
 * this column. Verified against the live constraint.
 */
export const IMPACT_TYPES = [
  "audience",
  "positioning",
  "value_proposition",
  "differentiation",
  "personality",
  "naming",
  "tagline",
  "voice",
  "messaging",
  "visual_direction",
  "launch",
] as const;

export type ImpactType = (typeof IMPACT_TYPES)[number];

/** Maps a category-shaped value to the exact spelling the constraint allows. */
export function toImpactType(raw: unknown): ImpactType | null {
  if (typeof raw !== "string") return null;
  const value = raw.trim().toLowerCase().replace(/[\s-]+/g, "_");
  return (IMPACT_TYPES as readonly string[]).includes(value)
    ? (value as ImpactType)
    : null;
}
