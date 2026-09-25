import type { ContextItem } from "@/lib/types/database";

const CONTEXT_REF_PATTERN =
  /\b(FACT|INFERENCE|HYPOTHESIS)\b[\s:,#—–-]*([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/gi;

/**
 * Model-written rationale cites its sources as `FACT <uuid>`. The id stays in the
 * stored text and keeps working for lookups and links; the presentation layer
 * swaps each reference for the context it points at: `FACT “Building an
 * AI-powered …”`. An id that no longer resolves falls back to its type label.
 */
export function resolveContextRefs(
  text: string,
  contextById: Map<string, ContextItem>,
): string {
  return text.replace(CONTEXT_REF_PATTERN, (match, type: string, id: string) => {
    const ctx = contextById.get(id);
    const content = ctx?.content.trim();
    if (!content) return type;
    const quoted =
      content.length > 110 ? `${content.slice(0, 110).trimEnd()}…` : content;
    return `${type} “${quoted}”`;
  });
}
