export const BRAND_PRIORITIES = [
  "Trust",
  "Privacy",
  "Differentiation",
  "Growth",
  "Community",
  "Simplicity",
] as const;

export const BRAND_PERSONALITIES = [
  "Bold",
  "Minimal",
  "Playful",
  "Premium",
  "Technical",
  "Human",
  "Unexpected",
] as const;

export type FounderDirectionFields = {
  priorities?: string | null;
  otherPriority?: string | null;
  mustCommunicate?: string | null;
  neverFeel?: string | null;
  personality?: string | null;
  personalityOther?: string | null;
  doNotOverride?: string | null;
};

/**
 * Turns the founder's "shape your brand direction" answers into prompt guidance.
 * Returns "" when the founder left everything blank.
 *
 * This is founder intent, never evidence: it is deliberately kept out of the
 * approved context model and is never emitted as a supporting_context_id.
 */
export function buildFounderGuidance(fields: FounderDirectionFields): string {
  const parts: string[] = [];

  const priorities = (fields.priorities ?? "")
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean)
    .slice(0, 3);
  const other = fields.otherPriority?.trim();
  if (priorities.length > 0) {
    parts.push(
      `Optimize for: ${priorities.join(", ")}${other ? ` (founder's own words: "${other}")` : ""}.`,
    );
  } else if (other) {
    parts.push(`Optimize for: "${other}".`);
  }

  const must = fields.mustCommunicate?.trim();
  if (must) parts.push(`The brand MUST communicate: ${must}`);

  const never = fields.neverFeel?.trim();
  if (never) parts.push(`The brand must NEVER feel like: ${never}`);

  const personality = (fields.personality ?? "")
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
  const personalityOther = fields.personalityOther?.trim();
  if (personality.length > 0) {
    parts.push(
      `Personality directions: ${personality.join(", ")}${personalityOther ? ` (founder's own words: "${personalityOther}")` : ""}.`,
    );
  } else if (personalityOther) {
    parts.push(`Personality direction: "${personalityOther}".`);
  }

  const protectedBelief = fields.doNotOverride?.trim();
  if (protectedBelief) {
    parts.push(
      `Founder constraint — do not override: ${protectedBelief} If a recommendation would conflict with this, say so inside its uncertainty field instead of quietly replacing it.`,
    );
  }

  return parts.join("\n");
}
