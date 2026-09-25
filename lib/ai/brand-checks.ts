/* ------------------------------------------------------------------ *
 * Brand checks: deterministic structure, evidence, and floors.
 *
 * This module has NO runtime imports on purpose — it holds the pure
 * logic that both the critic and the consistency guardian rely on, and
 * it can be exercised locally with fixtures without any network call.
 *
 * Semantics come later from the model; what lives here is the part that
 * must never depend on the model behaving well:
 *   - a NEEDS_REVIEW result must carry evidence
 *   - unsupported structure is downgraded to INSUFFICIENT_EVIDENCE
 *   - a deterministic cliché screen can only ever raise a status
 * ------------------------------------------------------------------ */

export type CheckType =
  | "generic"
  | "contradiction"
  | "potential_conflict"
  | "bias"
  | "audience_mismatch"
  | "unsupported_claim";

export type CheckStatus = "PASS" | "NEEDS_REVIEW" | "INSUFFICIENT_EVIDENCE";

export type BrandCheck = {
  id: string;
  check_type: CheckType;
  status: CheckStatus;
  decision_id: string;
  decision_category: string;
  evidence: string[];
  reason: string;
  alternative: string | null;
};

export const CHECK_TYPES: readonly CheckType[] = [
  "generic",
  "contradiction",
  "potential_conflict",
  "bias",
  "audience_mismatch",
  "unsupported_claim",
];

export const CHECK_STATUSES: readonly CheckStatus[] = [
  "PASS",
  "NEEDS_REVIEW",
  "INSUFFICIENT_EVIDENCE",
];

const CHECK_LABELS: Record<CheckType, string> = {
  generic: "Generic language",
  contradiction: "Contradiction",
  potential_conflict: "Potential conflict",
  bias: "Bias or exclusion",
  audience_mismatch: "Audience mismatch",
  unsupported_claim: "Weak specificity or unsupported claim",
};

/** Founder-facing name of a check. Never a severity judgement on its own. */
export function checkLabel(checkType: CheckType): string {
  return CHECK_LABELS[checkType] ?? checkType;
}

/** Severity of the legacy `issues` projection, derived from the check type. */
export function checkSeverity(checkType: CheckType): "high" | "medium" | "low" {
  if (checkType === "contradiction" || checkType === "bias") return "high";
  if (checkType === "potential_conflict") return "low";
  return "medium";
}

/**
 * A NEEDS_REVIEW must always hand the founder something to act on. When the
 * model omits a rewritten alternative, the check is still actionable: we
 * ground a bounded revision directive in the decision it flagged instead of
 * dropping the finding or inventing new brand facts.
 */
function groundedAlternative(
  checkType: CheckType,
  decision: { title?: string; content: string },
): string {
  const anchor = (decision.title ?? "").trim() || decision.content.trim().slice(0, 120);
  const keep = decision.content.trim().length > 0 ? decision.content.trim() : anchor;
  const byType: Record<CheckType, string> = {
    generic: `Rewrite "${anchor}" so it names who it serves, what it does, and the outcome, replacing all filler brand language.`,
    contradiction: `Rewrite "${anchor}" so it no longer conflicts with the other active decisions, and state which decision it must defer to.`,
    potential_conflict: `Tighten "${anchor}" so its wording cannot be read as conflicting with the related decision.`,
    bias: `Rewrite "${anchor}" so it makes no unstated assumption about who the user is, and state the assumption explicitly if it is required.`,
    audience_mismatch: `Rewrite "${anchor}" so its vocabulary, tone, and references match the documented audience, without inventing audience facts.`,
    unsupported_claim: `Rewrite "${anchor}" so every claim is either grounded in approved context or softened into a stated hypothesis.`,
  };
  return `${byType[checkType]}\n\nCURRENT CONTENT (keep anything that is already specific):\n${keep}`;
}

/* ------------------------- cliché screening ------------------------- */

/** Phrases that are common brand language rather than information. */
export const GENERIC_PHRASES: readonly string[] = [
  "empowering the next generation",
  "empower users",
  "unlock your potential",
  "innovative solutions",
  "innovative platform",
  "seamless experience",
  "seamless",
  "revolutionizing the industry",
  "revolutionary",
  "cutting-edge technology",
  "cutting-edge",
  "shaping the future",
  "transforming the way people",
  "next-generation platform",
  "next-generation",
  "best-in-class",
  "world-class",
  "game-changing",
  "world's leading",
  "the most trusted",
  "the easiest way to",
  "end-to-end solution",
  "one-stop shop",
  "holistic approach",
  "user-centric",
  "actionable insights",
  "unlock potential",
  "driving growth",
];

const STOPWORDS = new Set([
  "a", "an", "the", "and", "or", "of", "to", "for", "with", "that", "this", "it", "in",
  "on", "at", "by", "from", "as", "is", "are", "be", "their", "our", "your", "we",
  "they", "them", "who", "which", "while", "through", "into", "so", "than", "then",
  "how", "what", "why", "when", "not", "no", "do", "does", "can", "will", "you",
]);

function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[’']/g, "'")
    .replace(/[^a-z0-9'\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** All generic phrases present in the text, longest first. */
export function findGenericPhrases(text: string): string[] {
  const haystack = ` ${normalize(text)} `;
  const found: string[] = [];
  for (const phrase of GENERIC_PHRASES) {
    const needle = ` ${normalize(phrase)} `;
    if (haystack.includes(needle) && !found.includes(phrase)) found.push(phrase);
  }
  return found.sort((a, b) => b.length - a.length);
}

/** Distinct content words that are neither stopwords nor part of a cliché. */
export function specificContentWords(text: string, contextTerms: readonly string[] = []): string[] {
  const genericWords = new Set(
    GENERIC_PHRASES.flatMap((p) => normalize(p).split(" ")).filter(Boolean),
  );
  const context = new Set(
    contextTerms.flatMap((t) => normalize(t).split(" ")).filter((w) => w.length > 3),
  );
  const words = normalize(text)
    .split(" ")
    .filter((w) => w.length > 2 && !STOPWORDS.has(w) && !genericWords.has(w));
  const out: string[] = [];
  for (const w of words) {
    if (context.has(w) && !out.includes(w)) out.push(w);
    else if (!out.includes(w) && !context.has(w)) out.push(w);
  }
  return out;
}

export type GenericScreen = {
  phrases: string[];
  contentWords: string[];
  status: CheckStatus;
  reason: string;
  evidence: string[];
};

/**
 * Deterministic cliché check.
 *
 * A phrase is only flagged when it is generic AND the surrounding sentence
 * carries nothing specific. "Empowering the next generation through innovative
 * solutions" is nothing but cliché; "Help college students find complementary
 * teammates for hackathons" is specific and must not be flagged.
 */
export function screenGenericLanguage(
  text: string,
  contextTerms: readonly string[] = [],
  minContentWords = 5,
): GenericScreen {
  const phrases = findGenericPhrases(text);
  const contentWords = specificContentWords(text, contextTerms);
  if (phrases.length === 0) {
    return {
      phrases,
      contentWords,
      status: "PASS",
      reason: "No generic brand language found in this decision.",
      evidence: [],
    };
  }
  if (contentWords.length >= minContentWords) {
    return {
      phrases,
      contentWords,
      status: "PASS",
      reason: `Generic phrasing ("${phrases[0]}") is supported by specific product detail.`,
      evidence: [],
    };
  }
  return {
    phrases,
    contentWords,
    status: "NEEDS_REVIEW",
    reason:
      `The wording is built from ${phrases.length === 1 ? "a common brand phrase" : "common brand phrases"} ` +
      `and does not say anything specific about this product.`,
    evidence: phrases.map((p) => `"${p}"`),
  };
}

/* --------------------------- normalization -------------------------- */

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function text(raw: unknown, max: number): string | null {
  if (typeof raw !== "string") return null;
  const t = raw.trim();
  return t ? t.slice(0, max) : null;
}

export function normalizeCheckType(raw: unknown): CheckType | null {
  if (typeof raw !== "string") return null;
  const t = raw.trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (t === "generic" || t === "cliche" || t === "cliché") return "generic";
  if (t === "bias" || t === "exclusion") return "bias";
  if (t === "audience_mismatch") return "audience_mismatch";
  if (t === "unsupported_claim" || t === "weak_specificity") return "unsupported_claim";
  if (t === "contradiction") return "contradiction";
  if (t === "potential_conflict" || t === "soft_conflict") return "potential_conflict";
  return null;
}

export function normalizeCheckStatus(raw: unknown): CheckStatus | null {
  if (typeof raw !== "string") return null;
  const t = raw.trim().toUpperCase().replace(/[\s-]+/g, "_");
  if (t === "PASS") return "PASS";
  if (t === "NEEDS_REVIEW") return "NEEDS_REVIEW";
  if (t === "INSUFFICIENT_EVIDENCE") return "INSUFFICIENT_EVIDENCE";
  return null;
}

function normalizeEvidence(raw: unknown): string[] {
  const out: string[] = [];
  if (Array.isArray(raw)) {
    for (const entry of raw) {
      const t = text(entry, 400);
      if (t && !out.includes(t)) out.push(t);
      if (out.length >= 8) break;
    }
  } else {
    const t = text(raw, 1200);
    if (t) out.push(t);
  }
  return out;
}

/**
 * Structural validation for the critic response.
 *
 * - unknown check types / statuses / decision ids are dropped
 * - a NEEDS_REVIEW without evidence is downgraded to INSUFFICIENT_EVIDENCE
 * - a NEEDS_REVIEW for `generic` that the deterministic screen contradicts
 *   (the model passed a decision whose entire wording is cliché) is escalated
 */
export function normalizeBrandChecks(
  raw: unknown,
  options: {
    validDecisionIds: ReadonlySet<string>;
    decisions: ReadonlyArray<{ id: string; category: string; content: string; title?: string }>;
    contextTerms?: readonly string[];
  },
): BrandCheck[] {
  if (!isRecord(raw)) return [];
  const rows = Array.isArray(raw.checks) ? raw.checks : Array.isArray(raw.issues) ? raw.issues : [];
  const byId = new Map(options.decisions.map((d) => [d.id, d]));
  const checks: BrandCheck[] = [];
  const seen = new Set<string>();

  for (const row of rows) {
    if (!isRecord(row)) continue;
    const checkType = normalizeCheckType(row.check_type ?? row.detector);
    if (!checkType) continue;

    const decisionId = text(row.decision_id ?? row.affected_decision_id, 120);
    if (!decisionId || !options.validDecisionIds.has(decisionId)) continue;
    const decision = byId.get(decisionId);
    if (!decision) continue;

    let status = normalizeCheckStatus(row.status);
    if (!status) {
      if (row.status !== undefined && row.status !== null) continue; // explicitly invalid
      // Legacy shape: an "issue" with no status is a NEEDS_REVIEW finding.
      status = row.issue ? "NEEDS_REVIEW" : "INSUFFICIENT_EVIDENCE";
    }

    const evidence = normalizeEvidence(row.evidence);
    const reason = text(row.reason ?? row.issue, 2000) ?? "";
    const alternative = text(row.alternative ?? row.proposed_alternative, 5000);

    // A NEEDS_REVIEW has to be defensible: evidence to point at, a stated
    // reason, and something the founder can act on. Without them the finding
    // is not reviewable, so it is reported as INSUFFICIENT_EVIDENCE instead of
    // being presented as a defect.
    if (status === "NEEDS_REVIEW" && (evidence.length === 0 || reason.length === 0)) {
      status = "INSUFFICIENT_EVIDENCE";
    }
    if (status === "PASS" && reason.length === 0) continue;

    const id = text(row.id, 80) ?? `chk_${decisionId}_${checkType}`;
    const uniqueId = seen.has(id) ? `${id}_${checks.length}` : id;
    seen.add(uniqueId);

    checks.push({
      id: uniqueId,
      check_type: checkType,
      status,
      decision_id: decisionId,
      decision_category:
        text(row.decision_category ?? row.affected_category, 60) ?? decision.category,
      evidence,
      reason: reason || (status === "INSUFFICIENT_EVIDENCE" ? "The check could not be grounded in this decision's wording." : ""),
      alternative:
        status === "NEEDS_REVIEW" ? (alternative ?? groundedAlternative(checkType, decision)) : null,
    });
    if (checks.length >= 60) break;
  }

  return applyGenericFloor(checks, options.decisions, options.contextTerms ?? []);
}

/**
 * Deterministic floor for the cliché check. It can only raise a status from
 * PASS to NEEDS_REVIEW — it never downgrades a finding the model reported.
 */
export function applyGenericFloor(
  checks: BrandCheck[],
  decisions: ReadonlyArray<{ id: string; category: string; content: string; title?: string }>,
  contextTerms: readonly string[] = [],
): BrandCheck[] {
  const screenCache = new Map<string, GenericScreen>();
  return checks.map((check) => {
    if (check.check_type !== "generic" || check.status !== "PASS") return check;
    const decision = decisions.find((d) => d.id === check.decision_id);
    if (!decision) return check;
    let screen = screenCache.get(decision.id);
    if (!screen) {
      screen = screenGenericLanguage(
        `${decision.title ?? ""} ${decision.content}`,
        contextTerms,
      );
      screenCache.set(decision.id, screen);
    }
    if (screen.status !== "NEEDS_REVIEW") return check;
    return {
      ...check,
      status: "NEEDS_REVIEW",
      evidence: screen.evidence,
      reason: screen.reason,
      alternative: check.alternative ?? groundedAlternative(check.check_type, decision),
    };
  });
}

/** Per-decision view used by the UI: does anything need the founder's attention? */
export function checksForDecision(checks: readonly BrandCheck[], decisionId: string): BrandCheck[] {
  return checks.filter((c) => c.decision_id === decisionId);
}

export function needsReviewChecks(checks: readonly BrandCheck[]): BrandCheck[] {
  return checks.filter((c) => c.status === "NEEDS_REVIEW");
}

/** Checks the model could not ground. Surfaced, never silently dropped. */
export function insufficientEvidenceChecks(checks: readonly BrandCheck[]): BrandCheck[] {
  return checks.filter((c) => c.status === "INSUFFICIENT_EVIDENCE");
}
