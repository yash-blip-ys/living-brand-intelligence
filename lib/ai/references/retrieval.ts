import { readFile } from "node:fs/promises";
import path from "node:path";
import type { BrandDecisionCategory } from "@/lib/types/database";

export type ReferenceWorkflow =
  | "strategy"
  | "critique"
  | "consistency"
  | "evaluation"
  | "revision";

type ReferenceDefinition = {
  id: string;
  file: string;
  workflows: readonly ReferenceWorkflow[];
  categories: readonly BrandDecisionCategory[];
  keywords: readonly string[];
};

const REFERENCE_DEFINITIONS: readonly ReferenceDefinition[] = [
  {
    id: "positioning",
    file: "positioning.md",
    workflows: ["strategy", "evaluation", "revision"],
    categories: [
      "AUDIENCE",
      "POSITIONING",
      "VALUE_PROPOSITION",
      "DIFFERENTIATION",
      "MESSAGING",
    ],
    keywords: ["position", "differentiation", "audience", "value", "message"],
  },
  {
    id: "naming",
    file: "naming.md",
    workflows: ["strategy", "evaluation", "revision"],
    categories: ["NAMING"],
    keywords: ["name", "naming", "territory", "pronunciation", "trademark"],
  },
  {
    id: "voice",
    file: "voice.md",
    workflows: ["strategy", "evaluation", "revision"],
    categories: ["PERSONALITY", "VOICE", "TAGLINE", "MESSAGING"],
    keywords: ["voice", "tone", "personality", "copy", "language"],
  },
  {
    id: "visual",
    file: "visual.md",
    workflows: ["strategy", "evaluation", "revision"],
    categories: ["VISUAL_DIRECTION"],
    keywords: ["visual", "color", "type", "imagery", "logo", "shape"],
  },
  {
    id: "critique",
    file: "critique.md",
    workflows: ["critique", "evaluation", "revision"],
    categories: [],
    keywords: ["critic", "defect", "unsupported", "rewrite", "evidence"],
  },
  {
    id: "consistency",
    file: "consistency.md",
    workflows: ["consistency", "evaluation", "revision"],
    categories: [],
    keywords: ["consistency", "conflict", "alignment", "guardian", "pair"],
  },
  {
    id: "launch",
    file: "launch.md",
    workflows: ["strategy", "evaluation", "revision"],
    categories: ["LAUNCH"],
    keywords: ["launch", "headline", "cta", "social", "campaign", "founder"],
  },
];

export type RetrievedReference = {
  id: string;
  content: string;
};

export type ReferenceGrounding = {
  referenceIds: string[];
  content: string;
};

export type RetrieveReferencesInput = {
  workflow: ReferenceWorkflow;
  categories?: readonly BrandDecisionCategory[];
  query?: string;
  limit?: number;
};

const fileCache = new Map<string, Promise<string>>();

function tokenize(value: string): Set<string> {
  return new Set(
    value
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((token) => token.length >= 3),
  );
}

async function readReference(file: string): Promise<string> {
  const cached = fileCache.get(file);
  if (cached) return cached;
  const pending = readFile(
    path.join(process.cwd(), "lib", "ai", "references", file),
    "utf8",
  );
  fileCache.set(file, pending);
  return pending;
}

function scoreReference(
  definition: ReferenceDefinition,
  input: RetrieveReferencesInput,
  queryTokens: ReadonlySet<string>,
): number {
  let score = definition.workflows.includes(input.workflow) ? 10 : 0;
  const categories = new Set(input.categories ?? []);
  for (const category of definition.categories) {
    if (categories.has(category)) score += 6;
  }
  const definitionTokens = tokenize(
    `${definition.keywords.join(" ")} ${definition.categories.join(" ")}`,
  );
  for (const token of queryTokens) {
    if (definitionTokens.has(token)) score += 2;
  }
  return score;
}

export async function retrieveBrandReferences(
  input: RetrieveReferencesInput,
): Promise<ReferenceGrounding> {
  const limit = Math.max(1, Math.min(input.limit ?? 2, 4));
  const queryTokens = tokenize(input.query ?? "");
  const ranked = REFERENCE_DEFINITIONS.map((definition) => ({
    definition,
    score: scoreReference(definition, input, queryTokens),
  }))
    .filter((entry) => entry.score > 0)
    .sort(
      (a, b) =>
        b.score - a.score || a.definition.id.localeCompare(b.definition.id),
    )
    .slice(0, limit);

  const selected = await Promise.all(
    ranked.map(async (entry) => ({
      id: entry.definition.id,
      content: (await readReference(entry.definition.file)).trim(),
    })),
  );

  return {
    referenceIds: selected.map((reference) => reference.id),
    content: selected
      .map(
        (reference) =>
          `REFERENCE SOURCE id=${reference.id}\n${reference.content}`,
      )
      .join("\n\n---\n\n"),
  };
}
