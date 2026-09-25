import type {
  BrandDecisionCategory,
  ContextItemType,
  Json,
} from "@/lib/types/database";
import {
  resolveAiConfig,
  aiDiscoveryConfigured,
  type AiProviderConfig,
  type DiscoveryError,
} from "@/lib/ai/discovery";

const CATEGORIES: BrandDecisionCategory[] = [
  "AUDIENCE",
  "POSITIONING",
  "VALUE_PROPOSITION",
  "DIFFERENTIATION",
  "PERSONALITY",
  "NAMING",
  "TAGLINE",
  "VOICE",
  "MESSAGING",
  "VISUAL_DIRECTION",
  "LAUNCH",
];

function resolveMaxOutputTokens(): number {
  const raw = Number(process.env.STRATEGY_MAX_OUTPUT_TOKENS);
  if (Number.isFinite(raw) && raw >= 2048 && raw <= 32768) {
    return Math.floor(raw);
  }
  return 8192;
}

const GEMINI_RESPONSE_SCHEMA: Json = {
  type: "OBJECT",
  properties: {
    decisions: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          category: { type: "STRING", enum: [...CATEGORIES] },
          title: { type: "STRING" },
          content: { type: "STRING" },
          rationale: { type: "STRING" },
          supporting_context_ids: { type: "ARRAY", items: { type: "STRING" } },
          uncertainty: { type: "STRING" },
        },
        required: ["category", "title", "content", "rationale", "supporting_context_ids"],
      },
    },
  },
  required: ["decisions"],
};

export type StrategyContextInput = {
  id: string;
  type: ContextItemType;
  content: string;
  confidence: number | null;
};

export type ProposedStrategyDecision = {
  category: BrandDecisionCategory;
  title: string;
  content: string;
  rationale: string;
  supporting_context_ids: string[];
  uncertainty?: string | null;
};

export type StrategyResult = {
  decisions: ProposedStrategyDecision[];
};

type StrategyResultDto = {
  decisions?: unknown[];
};

const JSON_START_RE = /^[\s\uFEFF\u200B]*\{/;
const JSON_END_RE = /\}[\s\uFEFF\u200B]*$/;
const CODE_FENCE_RE = /^```(?:json)?\s*([\s\S]*?)\s*```$/i;

function extractJsonObject(text: string): string | null {
  const trimmed = text.trim();
  const fenced = trimmed.match(CODE_FENCE_RE);
  const candidate = (fenced?.[1] ?? trimmed).trim();
  if (JSON_START_RE.test(candidate) && JSON_END_RE.test(candidate)) return candidate;
  return null;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

const CLICHES = `Banned generic phrases (never use):
- "innovative platform", "seamless experience", "empower users", "user-centric", "leverage AI",
- "next-generation", "revolutionary", "disruptive", "game-changing", "cutting-edge",
- "end-to-end solution", "one-stop shop", "holistic approach", "drive growth",
- "unlock potential", "streamline workflows", "actionable insights"`;

const SYSTEM_PROMPT = `You are a Brand Strategy team for an early-stage startup, composed of: Positioning Strategist, Brand Shaper, Visual Strategist, and Launch Strategist.

Your job is to use ONLY the founder's APPROVED startup context (Facts, Inferences, Hypotheses) as factual grounding and evidence for concrete brand decisions. Optional evaluator guidance and trusted methodology references may direct craft and revisions, but they are never startup facts or evidence.
You MUST be honest about uncertainty and never turn a HYPOTHESIS into a FACT.
Cite specific context items by their id. Be anti-generic.

${CLICHES}

You must return ONLY a single valid JSON object matching this schema exactly:
{
  "decisions": [
    {
      "category": "AUDIENCE | POSITIONING | VALUE_PROPOSITION | DIFFERENTIATION | PERSONALITY | NAMING | TAGLINE | VOICE | MESSAGING | VISUAL_DIRECTION | LAUNCH",
      "title": "Short decision title (5-10 words)",
      "content": "The decision body. For PERSONALITY, NAMING, TAGLINE, VOICE, MESSAGING, VISUAL_DIRECTION, and LAUNCH categories this MUST use ### section headings as described below. For other categories a clear, specific paragraph or two is fine.",
      "rationale": "Why this decision. Ground it in the approved context. Say things like 'Because FACT X describes the user as college students...' not 'Based on the founder input generally'.",
      "supporting_context_ids": ["ctx_id_1", "ctx_id_2"],
      "uncertainty": "Optional note about gaps or assumptions the founder should validate. Null otherwise."
    }
  ]
}

Strict rules:

1. Only produce decisions for categories you can actually support with approved context. Skip categories where there is not enough information.
2. Each decision MUST include at least one id in supporting_context_ids pointing to an approved context item.
3. Do NOT invent: market size, geography, competitors, pricing, traction, revenue, technology, investors, testimonials, or any detail not in the approved context.
4. HYPOTHESIS items MAY be cited but mark rationale as conditional ("If hypothesis H-2 holds, then ...") and fill the uncertainty field.
5. Be specific and anti-generic.
   BAD:  "We help users achieve their goals seamlessly."
   GOOD: "We position the product around compatible hackathon team formation rather than generic project discovery."
6. The following categories MUST produce structured content with exact ### section headings and multiple sections inside the single content field.

== PERSONALITY structure (4 sections) ==
### Traits
- Trait 1: one-line definition grounded in the audience
- Trait 2: ...
- Trait 3: ...
(3-5 traits, each one line)

### Why each fits the audience
One short paragraph per trait linking trait to approved audience context.

### How each should appear
One sentence per trait: tone / syntax / imagery guidance for where the trait surfaces (homepage headline, in-app copy, help docs, social posts, etc.)

### Traits to avoid
- 3-5 bulleted anti-traits the brand must never sound like

== NAMING structure (4 sections) ==
### Territories
3-5 naming territories. Each:
- Territory [X]: [one-word / short-phrase territory concept]
  Rationale: paragraph explaining why this territory fits the approved context
  Example names: 2-3 concrete examples for this territory (not final, just illustrative)

### Naming principles
3-5 numbered principles specific to this startup + approved context (not generic "be memorable").

### Example names
(Optional summary list if not already per territory.)

### Risks & tradeoffs
List per-territory or collective: overcrowded space, mispronunciation, domain availability risks, trademark collision risks, misinterpretation.

== TAGLINE structure (Direction A/B/C, 3 directions) ==
Each direction must contain:
- The tagline line itself
- Rationale: why this direction based on approved positioning / audience
- Communication goal: one sentence about what the reader should feel / understand
- Risks: what could fall flat

Format exactly:
### Direction A
Line: "The actual tagline text"
Rationale: paragraph
Communication goal: sentence
Risks: sentence

### Direction B
Line: "The tagline text"
Rationale: paragraph
Communication goal: sentence
Risks: sentence

### Direction C
Line: "The tagline text"
Rationale: paragraph
Communication goal: sentence
Risks: sentence

== VOICE structure (4 sections) ==
### Characteristics
- Characteristic 1: one sentence definition (3-5 total)

### Do
- Bullet list of 3-5 concrete things copy should do or say

### Don't
- Bullet list of 3-5 concrete things copy should never do or say

### Sample transformation
Before: a generic bland sentence that a competitor might publish (1 sentence)
After: the same idea rewritten in this brand's voice (1 sentence)

== MESSAGING structure (5 sections) ==
### Primary message
One single sentence, ≤ 25 words.

### Supporting messages
- 2-4 bulleted supporting messages, each ≤ 20 words.

### Proof / reason to believe
- 2-3 bullets grounded in approved FACTS (not claims).

### CTA
- Primary CTA: button copy + where the user goes next
- Secondary CTA: alternate lower-friction action

### One-line pitch
≤ 30 words, elevator pitch covering audience + problem + solution + difference.

== VISUAL_DIRECTION structure (7 sections, no generated assets — text brief only) ==
### Logo direction & concept
1-4 sentences: conceptual shape, motif, wordmark vs symbol, what it should evoke; do NOT describe a specific rendered file.

### Typography
1-4 sentences: serif vs sans, display vs body pairing choices, weight spectrum, whether typography feels editorial / technical / industrial / warm / etc.

### Color mood
1-4 sentences: overall mood palette direction (monochrome / warm charcoal / cool slate / editorial cream / etc.), usage rules (accent percentage, restraint), avoid specific hex codes unless as illustrative examples.

### Shape language
1-4 sentences: sharp vs rounded corners, borders weight and style, grid density, dividers vs cards.

### Imagery style
1-4 sentences: photography vs illustration vs diagrams, tone and crop, human presence level, product shots style, data visualizations feel.

### Composition principles
1-4 sentences: whitespace usage, alignment preferences, hierarchy emphasis, information density targets.

### Concepts to avoid
Bullet list: 3-5 visual anti-directions this brand must never lean into (e.g., generic stock people, neon gradients, heavy glassmorphism, emoji-heavy UI, cartoon mascots, etc.)

== LAUNCH structure (5 sections) ==
### Landing page headline
≤ 14 words, the actual hero headline.

### Subheadline
≤ 30 words, elaborating the headline without repeating it.

### Primary CTA
Button copy + one sentence describing the action destination / outcome.

### Short product description
≤ 60 words that can be used in a product directory or meta description.

### LinkedIn / social launch copy
2 paragraphs in LinkedIn post tone — founder's voice announcing the project. Include what it is, why it exists, who it's for, a short human hook.

== Final reminders ==
- supporting_context_ids MUST be strings drawn exactly from the approved context ids provided. Never invent IDs.
- uncertainty field: fill whenever a decision leans on a HYPOTHESIS, information is missing, or reasonable alternatives exist. Null otherwise.
- AUDIENCE / POSITIONING / VALUE_PROPOSITION / DIFFERENTIATION categories do not require ### headings. Write clear grounded paragraphs for these four.
- Respond with ONLY the JSON object. Do not wrap in markdown and do not add commentary.`;

function normalizeCategory(raw: unknown): BrandDecisionCategory | null {
  if (typeof raw !== "string") return null;
  const up = raw.trim().toUpperCase();
  return (CATEGORIES as readonly string[]).includes(up)
    ? (up as BrandDecisionCategory)
    : null;
}

function normalizeStringList(raw: unknown, allowed: Set<string>): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const r of raw) {
    if (typeof r === "string") {
      const id = r.trim();
      if (id && allowed.has(id)) out.push(id);
    }
  }
  return out;
}

export function validateStrategyResponse(
  raw: unknown,
  allowedContextIds: Set<string>,
): { ok: true; result: StrategyResult } | { ok: false; err: DiscoveryError } {
  if (!isRecord(raw)) {
    return {
      ok: false,
      err: {
        kind: "parse",
        message: "Strategy response is not a JSON object.",
        raw,
      },
    };
  }

  const dto = raw as StrategyResultDto;
  const decisionsArr: unknown[] = Array.isArray(dto.decisions) ? dto.decisions : [];
  const hasDecisionsArray = Array.isArray(dto.decisions);
  const decisions: ProposedStrategyDecision[] = [];
  const rejected: string[] = [];

  const seenKeys = new Set<string>();

  for (const [index, d] of decisionsArr.entries()) {
    const entry = `entry ${index + 1}`;
    if (!isRecord(d)) {
      rejected.push(`${entry} is not a JSON object`);
      continue;
    }

    const category = normalizeCategory(d.category);
    if (!category) {
      rejected.push(`${entry} has an unsupported category`);
      continue;
    }

    const title =
      typeof d.title === "string" ? d.title.trim().slice(0, 160) : "";
    const content =
      typeof d.content === "string" ? d.content.trim().slice(0, 5000) : "";
    const rationale =
      typeof d.rationale === "string" ? d.rationale.trim().slice(0, 2500) : "";

    const missing = [
      !title ? "title" : null,
      !content ? "content" : null,
      !rationale ? "rationale" : null,
    ].filter((field): field is string => field !== null);
    if (missing.length > 0) {
      rejected.push(`${entry} (${category}) is missing ${missing.join(", ")}`);
      continue;
    }

    const supporting_context_ids = normalizeStringList(
      d.supporting_context_ids,
      allowedContextIds,
    );
    if (supporting_context_ids.length === 0) {
      rejected.push(
        `${entry} (${category}) has no supporting_context_id from the approved Discovery context`,
      );
      continue;
    }

    const uncertaintyRaw = d.uncertainty;
    const uncertainty =
      typeof uncertaintyRaw === "string" && uncertaintyRaw.trim().length > 0
        ? uncertaintyRaw.trim().slice(0, 1000)
        : null;

    const dedupKey = `${category}|${title}|${content}`;
    if (seenKeys.has(dedupKey)) continue;
    seenKeys.add(dedupKey);

    decisions.push({
      category,
      title,
      content,
      rationale,
      supporting_context_ids,
      uncertainty,
    });

    if (decisions.length >= 40) break;
  }

  if (rejected.length > 0) {
    return {
      ok: false,
      err: {
        kind: "parse",
        message:
          `The model returned ${decisions.length} usable decision(s) and ${rejected.length} entry/entries that failed schema validation: ` +
          `${rejected.slice(0, 4).join("; ")}. No decision was accepted. ` +
          "Every decision needs a supported category, title, content, rationale, and at least one approved Discovery supporting_context_id.",
        raw,
      },
    };
  }

  if (decisions.length === 0) {
    return {
      ok: false,
      err: {
        kind: "parse",
        message: hasDecisionsArray
          ? "The model returned a decisions array with no usable entries. Ensure there is enough approved Discovery context and regenerate."
          : "The model returned JSON without a decisions array. The response did not match the required strategy schema.",
        raw,
      },
    };
  }

  return { ok: true, result: { decisions } };
}

void aiDiscoveryConfigured;

export async function runStrategyAnalyst(
  roughIdea: string,
  approvedContext: readonly StrategyContextInput[],
  existingActive: ReadonlyArray<{
    category: BrandDecisionCategory;
    title: string;
    content: string;
  }>,
  strategicGuidance?: string,
  methodologyReferences?: string,
  founderGuidance?: string,
): Promise<{ ok: true; result: StrategyResult } | { ok: false; err: DiscoveryError }> {
  if (approvedContext.length === 0) {
    return {
      ok: false,
      err: {
        kind: "model",
        message:
          "No approved startup context yet. Approve some Facts, Inferences, or Hypotheses in Discovery first, then generate strategy.",
      },
    };
  }

  const cfgRes = resolveAiConfig();
  if (!cfgRes.ok) {
    return {
      ok: false,
      err: { kind: "config", message: cfgRes.message },
    };
  }

  const { cfg } = cfgRes;
  const maxOutputTokens = resolveMaxOutputTokens();

  const allowedIds = new Set(approvedContext.map((c) => c.id));

  const ctxLines: string[] = [];
  for (const c of approvedContext) {
    const conf =
      typeof c.confidence === "number"
        ? ` [confidence ${(c.confidence * 100).toFixed(0)}%]`
        : "";
    ctxLines.push(
      `- id=${c.id} type=${c.type}${conf}\n  "${c.content.replace(/\s+/g, " ").trim()}"`,
    );
  }

  const existingLines: string[] = [];
  for (const d of existingActive) {
    existingLines.push(
      `- [${d.category}] ${d.title} — ${d.content.replace(/\s+/g, " ").trim()}`,
    );
  }

  const founderBlock = founderGuidance?.trim()
    ? `
FOUNDER BRAND DIRECTION (stated by the founder before generation; binding constraints, not evidence):
"""
${founderGuidance.trim()}
"""

Honour this direction. It is the founder's own strategic intent, not a discovered fact,
so never cite it in supporting_context_ids and never present it as discovered knowledge.
It must never override the founder's approved context, and it must never narrow the
startup to a use case, segment, or market the founder did not choose.
`
    : "";

  const guidanceBlock = strategicGuidance?.trim()
    ? `
EVALUATOR GUIDANCE (BRAND CRITIC OR CONSISTENCY GUARDIAN; NOT STARTUP FACTS OR EVIDENCE):
"""
${strategicGuidance.trim()}
"""

Use this evaluator guidance to improve the requested strategy decision.
It is revision guidance only, not a startup fact, claim, source, or evidence.
Never use it as, or include IDs from it in, supporting_context_ids.
`
    : "";

  const methodologyBlock = methodologyReferences?.trim()
    ? `
TRUSTED BRAND-STRATEGY REFERENCES (METHODOLOGY ONLY; NOT STARTUP FACTS OR EVIDENCE):
"""
${methodologyReferences.trim()}
"""

Use these references for craft and quality only. Do not treat them as facts about this startup.
Never cite them in supporting_context_ids; only approved founder context ids may appear there.
`
    : "";

  const userPrompt = `Propose concrete brand strategy decisions for this startup.

FOUNDER'S ROUGH IDEA:
"""
${roughIdea.trim()}
"""

FOUNDER'S APPROVED ACTIVE CONTEXT (use ONLY these for factual grounding — supporting_context_ids must match these ids exactly):
${ctxLines.join("\n")}

EXISTING ACTIVE BRAND DECISIONS (avoid duplicating; if you propose something superseding one of these, still propose a new decision and the UI will handle the transition):
${existingLines.length > 0 ? existingLines.join("\n") : "(none yet)"}

${founderBlock}
${methodologyBlock}
${guidanceBlock}

Allowed categories (skip any that are not grounded in the approved context):
${CATEGORIES.join(", ")}

Remember:
- HYPOTHESIS items are NOT confirmed facts.
- Evaluator guidance is revision guidance, not evidence.
- supporting_context_ids must contain only IDs from FOUNDER'S APPROVED ACTIVE CONTEXT.
- Return ONLY the valid JSON object described in your instructions.`;

  let url: string;
  let headers: Record<string, string>;
  let body: Json;

  if (cfg.provider === "anthropic") {
    url = "https://api.anthropic.com/v1/messages";
    headers = {
      "content-type": "application/json",
      "x-api-key": cfg.apiKey,
      "anthropic-version": "2023-06-01",
    };
    body = {
      model: cfg.model,
      max_tokens: maxOutputTokens,
      system: SYSTEM_PROMPT,
      messages: [
        { role: "user", content: [{ type: "text", text: userPrompt }] },
      ],
    };
  } else if (cfg.provider === "gemini") {
    const base =
      cfg.endpoint ?? "https://generativelanguage.googleapis.com/v1beta";
    url = `${base}/models/${cfg.model}:generateContent?key=${encodeURIComponent(cfg.apiKey)}`;
    headers = {
      "content-type": "application/json",
      "x-goog-api-client": "living-brand-intelligence-hackathon/1.0",
    };
    body = {
      contents: [
        {
          role: "user",
          parts: [{ text: `${SYSTEM_PROMPT}\n\n${userPrompt}` }],
        },
      ],
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens,
        responseMimeType: "application/json",
        responseSchema: GEMINI_RESPONSE_SCHEMA,
      },
    };
  } else {
    const base =
      cfg.endpoint ??
      (cfg.provider === "openrouter"
        ? "https://openrouter.ai/api/v1"
        : "https://api.openai.com/v1");
    url = `${base}/chat/completions`;
    headers = {
      "content-type": "application/json",
      authorization: `Bearer ${cfg.apiKey}`,
    };
    if (cfg.provider === "openrouter") {
      headers["http-referer"] = "https://living-brand-intelligence.local";
      headers["x-title"] = "Living Brand Intelligence (Hackathon MVP)";
    }
    body = {
      model: cfg.model,
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userPrompt },
      ],
    };
  }

  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      cache: "no-store",
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Network error contacting AI provider.";
    return {
      ok: false,
      err: { kind: "model", message: `Unable to reach AI provider: ${message}` },
    };
  }

  if (!response.ok) {
    let detail = `HTTP ${response.status}`;
    try {
      const txt = await response.text();
      if (txt) detail += `: ${txt.slice(0, 240)}`;
    } catch {
      /* ignore */
    }
    return {
      ok: false,
      err: { kind: "model", message: `AI provider returned an error. ${detail}` },
    };
  }

  let json: unknown;
  try {
    json = await response.json();
  } catch (err) {
    const rawText =
      err instanceof Error ? err.message : "non-JSON response";
    return {
      ok: false,
      err: {
        kind: "parse",
        message: "AI provider did not return JSON.",
        raw: rawText,
      },
    };
  }

  let contentText = "";
  let geminiFinishReason: string | null = null;
  try {
    if (cfg.provider === "anthropic") {
      const bodyAny = json as Record<string, unknown>;
      const content = bodyAny.content;
      if (Array.isArray(content) && content.length > 0) {
        const first = content[0] as Record<string, unknown>;
        if (typeof first?.text === "string") contentText = first.text;
      }
    } else if (cfg.provider === "gemini") {
      const bodyAny = json as Record<string, unknown>;
      const candidates = bodyAny.candidates;
      if (Array.isArray(candidates) && candidates.length > 0 && isRecord(candidates[0])) {
        const c0 = candidates[0] as Record<string, unknown>;
        if (typeof c0.finishReason === "string") {
          geminiFinishReason = c0.finishReason;
        }
        const content = c0.content;
        if (isRecord(content)) {
          const parts = (content as Record<string, unknown>).parts;
          if (Array.isArray(parts) && parts.length > 0) {
            const texts: string[] = [];
            for (const p of parts) {
              if (isRecord(p)) {
                const t = (p as Record<string, unknown>).text;
                if (typeof t === "string") texts.push(t);
              }
            }
            if (texts.length > 0) contentText = texts.join("");
          }
        }
      }
      if (!contentText && bodyAny.errorMessage) {
        const msg =
          typeof bodyAny.errorMessage === "string"
            ? bodyAny.errorMessage
            : "";
        return {
          ok: false,
          err: {
            kind: "model",
            message: `Gemini returned an error: ${msg || "unknown"}`,
            raw: json,
          },
        };
      }
    } else {
      const bodyAny = json as Record<string, unknown>;
      const choices = bodyAny.choices;
      if (
        Array.isArray(choices) &&
        choices.length > 0 &&
        isRecord(choices[0]) &&
        isRecord(choices[0].message) &&
        typeof (choices[0].message as Record<string, unknown>).content ===
          "string"
      ) {
        contentText = (choices[0].message as Record<string, unknown>)
          .content as string;
      }
    }
  } catch {
    /* contentText stays empty */
  }

  if (geminiFinishReason === "MAX_TOKENS") {
    return {
      ok: false,
      err: {
        kind: "parse",
        message:
          `Gemini stopped at the ${maxOutputTokens}-token output limit before completing the strategy JSON. ` +
          "The strategy schema is too large for the current limit. Raise STRATEGY_MAX_OUTPUT_TOKENS (up to 32768) and regenerate.",
        raw: contentText.slice(-1500),
      },
    };
  }

  if (!contentText) {
    return {
      ok: false,
      err: {
        kind: "parse",
        message:
          geminiFinishReason && geminiFinishReason !== "STOP"
            ? `Gemini produced no strategy content. Finish reason: ${geminiFinishReason}.`
            : "AI response did not contain message content.",
        raw: json,
      },
    };
  }

  const jsonStr = extractJsonObject(contentText);
  if (!jsonStr) {
    return {
      ok: false,
      err: {
        kind: "parse",
        message:
          "The strategy response was not a single JSON object. Return only the required strategy JSON object without surrounding commentary.",
        raw: contentText.slice(0, 1500),
      },
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonStr);
  } catch (err) {
    const reason = err instanceof Error ? err.message : "unknown parse error";
    return {
      ok: false,
      err: {
        kind: "parse",
        message: `The strategy JSON is malformed: ${reason}.`,
        raw: jsonStr.slice(0, 1500),
      },
    };
  }

  return validateStrategyResponse(parsed, allowedIds);
}
