import type { ContextItemType, Json } from "@/lib/types/database";

export type DiscoveryContextInput = {
  content: string;
  confidence?: number | null;
  source?: string | null;
  reasoning?: string | null;
};

export type DiscoveryResult = {
  facts: DiscoveryContextInput[];
  inferences: DiscoveryContextInput[];
  hypotheses: DiscoveryContextInput[];
};

type DiscoveryResultDto = {
  facts?: unknown[];
  inferences?: unknown[];
  hypotheses?: unknown[];
};

export type DiscoveryError =
  | { kind: "config"; message: string }
  | { kind: "model"; message: string; raw?: unknown }
  | { kind: "parse"; message: string; raw: unknown };

const SYSTEM_PROMPT = `You are a Startup Discovery Analyst — a specialist whose only job is to understand the founder's rough startup idea and turn it into structured, honest knowledge.

Your output must be valid JSON matching this schema exactly:
{
  "facts": [
    { "content": "...", "confidence": 0.00..1.00, "source": "founder_input" }
  ],
  "inferences": [
    { "content": "...", "confidence": 0.00..1.00, "reasoning": "..." }
  ],
  "hypotheses": [
    { "content": "...", "confidence": 0.00..1.00, "reasoning": "..." }
  ]
}

Strict instructions:

- FACT = something explicitly stated in the founder's input, or directly supported word-for-word. Never invent a fact.
- INFERENCE = a reasonable interpretation of the input that the founder implied without stating. Keep it grounded in the input.
- HYPOTHESIS = a plausible but unconfirmed assumption that the product or team should validate later.

- Do not invent customers, market size, traction, competitors, geography, pricing, revenue, technology stack, or business model unless the founder actually wrote them.
- Do not produce branding work yet: no names, taglines, voice, personality, positioning, colors, logos, or launch copy. That is a later phase.
- Do not make strategic brand decisions. You are only understanding.
- Prefer uncertainty over fabricated certainty. If there are only 2 facts, return 2 facts — do not pad.
- Aim for roughly 3–6 facts, 2–5 inferences, 2–5 hypotheses. More is not better.
- Each item must be atomic (one idea per item), specific, and useful.
- Avoid generic startup language such as "empowering users", "the next generation", or any sentence that could describe thousands of startups.
- confidence must reflect the QUALITY of evidence from the founder's input, not how confident you can sound. Facts should be high (0.90–1.0), inferences mid-range, hypotheses clearly lower.
- For facts, source must always be exactly "founder_input".
- For inferences and hypotheses, explain reasoning in 1–2 short sentences.
- Respond with ONLY the JSON object. Do not wrap in markdown or add commentary.`;

const JSON_START_RE = /^[\s\uFEFF\u200B]*\{/;
const JSON_END_RE = /\}[\s\uFEFF\u200B]*$/;

function findJson(text: string): string | null {
  const trimmed = text.trim();
  if (JSON_START_RE.test(trimmed) && JSON_END_RE.test(trimmed)) {
    return trimmed;
  }
  const first = trimmed.indexOf("{");
  const last = trimmed.lastIndexOf("}");
  if (first === -1 || last === -1 || last <= first) return null;
  return trimmed.slice(first, last + 1);
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function inRange(n: number): boolean {
  return Number.isFinite(n) && n >= 0 && n <= 1;
}

function normalizeBucket(
  bucket: unknown,
  kind: ContextItemType,
): DiscoveryContextInput[] {
  if (!Array.isArray(bucket)) return [];

  const out: DiscoveryContextInput[] = [];
  const maxItems = kind === "FACT" ? 8 : 8;

  for (const raw of bucket) {
    if (out.length >= maxItems) break;
    if (!isRecord(raw)) continue;

    const content = typeof raw.content === "string" ? raw.content.trim() : "";
    if (!content) continue;

    const confidenceRaw = raw.confidence;
    let confidence: number | null = null;
    if (typeof confidenceRaw === "number" && inRange(confidenceRaw)) {
      confidence = Number(confidenceRaw.toFixed(2));
    }

    const sourceRaw = raw.source;
    const source: string | null =
      typeof sourceRaw === "string" && sourceRaw.trim().length > 0
        ? sourceRaw.trim().slice(0, 120)
        : kind === "FACT"
        ? "founder_input"
        : null;

    const reasoningRaw = raw.reasoning;
    const reasoning: string | null =
      typeof reasoningRaw === "string" && reasoningRaw.trim().length > 0
        ? reasoningRaw.trim().slice(0, 400)
        : null;

    out.push({ content, confidence, source, reasoning });
  }

  return out;
}

export function validateDiscoveryResponse(
  raw: unknown,
): { ok: true; result: DiscoveryResult } | { ok: false; err: DiscoveryError } {
  if (!isRecord(raw)) {
    return { ok: false, err: { kind: "parse", message: "Response is not a JSON object.", raw } };
  }

  const dto = raw as DiscoveryResultDto;

  const result: DiscoveryResult = {
    facts: normalizeBucket(dto.facts, "FACT"),
    inferences: normalizeBucket(dto.inferences, "INFERENCE"),
    hypotheses: normalizeBucket(dto.hypotheses, "HYPOTHESIS"),
  };

  if (
    result.facts.length === 0 &&
    result.inferences.length === 0 &&
    result.hypotheses.length === 0
  ) {
    return {
      ok: false,
      err: {
        kind: "parse",
        message: "The model returned an empty structured result.",
        raw,
      },
    };
  }

  return { ok: true, result };
}

export function aiDiscoveryConfigured(): boolean {
  const provider =
    process.env.AI_PROVIDER ||
    (process.env.OPENAI_API_KEY ? "openai" : null) ||
    (process.env.OPENROUTER_API_KEY ? "openrouter" : null) ||
    (process.env.ANTHROPIC_API_KEY ? "anthropic" : null) ||
    (process.env.GEMINI_API_KEY ? "gemini" : null);
  return Boolean(provider);
}

export type AiProviderConfig = {
  provider: "openai" | "openrouter" | "anthropic" | "gemini";
  apiKey: string;
  model: string;
  endpoint?: string;
};

export function resolveAiConfig():
  | { ok: true; cfg: AiProviderConfig }
  | { ok: false; message: string } {
  const explicitProvider = (process.env.AI_PROVIDER ?? "").toLowerCase();

  const openrouterKey = process.env.OPENROUTER_API_KEY?.trim() ?? "";
  const openaiKey = process.env.OPENAI_API_KEY?.trim() ?? "";
  const anthropicKey = process.env.ANTHROPIC_API_KEY?.trim() ?? "";
  const geminiKey = process.env.GEMINI_API_KEY?.trim() ?? "";

  let provider: AiProviderConfig["provider"] | null = null;
  let apiKey = "";

  if (explicitProvider === "openrouter" && openrouterKey) {
    provider = "openrouter";
    apiKey = openrouterKey;
  } else if (explicitProvider === "anthropic" && anthropicKey) {
    provider = "anthropic";
    apiKey = anthropicKey;
  } else if (explicitProvider === "openai" && openaiKey) {
    provider = "openai";
    apiKey = openaiKey;
  } else if (explicitProvider === "gemini" && geminiKey) {
    provider = "gemini";
    apiKey = geminiKey;
  } else if (openrouterKey) {
    provider = "openrouter";
    apiKey = openrouterKey;
  } else if (openaiKey) {
    provider = "openai";
    apiKey = openaiKey;
  } else if (anthropicKey) {
    provider = "anthropic";
    apiKey = anthropicKey;
  } else if (geminiKey) {
    provider = "gemini";
    apiKey = geminiKey;
  }

  if (!provider || !apiKey) {
    return {
      ok: false,
      message:
        "No AI provider configured. Set one of the following server-side environment variables:\n" +
        "  • AI_PROVIDER=openai + OPENAI_API_KEY\n" +
        "  • AI_PROVIDER=openrouter + OPENROUTER_API_KEY\n" +
        "  • AI_PROVIDER=anthropic + ANTHROPIC_API_KEY\n" +
        "  • AI_PROVIDER=gemini + GEMINI_API_KEY",
    };
  }

  let model: string;
  let endpoint: string | undefined;

  if (provider === "openai") {
    model = process.env.OPENAI_MODEL?.trim() || "gpt-4o-mini";
  } else if (provider === "openrouter") {
    model =
      process.env.OPENROUTER_MODEL?.trim() ||
      "openai/gpt-4o-mini";
    endpoint =
      process.env.OPENROUTER_BASE_URL?.trim() ||
      "https://openrouter.ai/api/v1";
  } else if (provider === "anthropic") {
    model = process.env.ANTHROPIC_MODEL?.trim() || "claude-3-5-sonnet-latest";
  } else {
    model =
      process.env.GEMINI_MODEL?.trim() || "gemini-3.5-flash-lite";
    endpoint =
      process.env.GEMINI_BASE_URL?.trim() ||
      "https://generativelanguage.googleapis.com/v1beta";
  }

  return {
    ok: true,
    cfg: { provider, apiKey, model, endpoint },
  };
}

export async function runDiscoveryAnalyst(
  roughIdea: string,
): Promise<{ ok: true; result: DiscoveryResult } | { ok: false; err: DiscoveryError }> {
  const trimmed = roughIdea.trim();
  if (!trimmed) {
    return {
      ok: false,
      err: { kind: "model", message: "No rough idea provided." },
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

  const userPrompt = `Here is the founder's rough startup idea. Analyze it as a Startup Discovery Analyst.

FOUNDER'S ROUGH IDEA:
"""
${trimmed}
"""

Remember: no branding yet. Only understanding. Return ONLY the valid JSON object described in your instructions.`;

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
      max_tokens: 1800,
      system: SYSTEM_PROMPT,
      messages: [
        { role: "user", content: [{ type: "text", text: userPrompt }] },
      ],
    };
  } else if (cfg.provider === "gemini") {
    const base = cfg.endpoint ?? "https://generativelanguage.googleapis.com/v1beta";
    url = `${base}/models/${cfg.model}:generateContent?key=${encodeURIComponent(cfg.apiKey)}`;
    headers = {
      "content-type": "application/json",
      "x-goog-api-client": "living-brand-intelligence-hackathon/1.0",
    };
    body = {
      contents: [
        {
          role: "user",
          parts: [
            {
              text: `${SYSTEM_PROMPT}\n\n${userPrompt}`,
            },
          ],
        },
      ],
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens: 1800,
        responseMimeType: "application/json",
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
      err: { kind: "parse", message: "AI provider did not return JSON.", raw: rawText },
    };
  }

  let contentText = "";

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
      if (
        Array.isArray(candidates) &&
        candidates.length > 0 &&
        isRecord(candidates[0])
      ) {
        const firstCandidate = candidates[0] as Record<string, unknown>;
        const content = firstCandidate.content;
        if (isRecord(content)) {
          const parts = (content as Record<string, unknown>).parts;
          if (Array.isArray(parts) && parts.length > 0) {
            const texts: string[] = [];
            for (const p of parts) {
              if (isRecord(p)) {
                const maybeText = (p as Record<string, unknown>).text;
                if (typeof maybeText === "string") texts.push(maybeText);
              }
            }
            if (texts.length > 0) contentText = texts.join("");
          }
        }
      }
      if (!contentText && bodyAny.errorMessage) {
        const msg = typeof bodyAny.errorMessage === "string" ? bodyAny.errorMessage : "";
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

  if (!contentText) {
    return {
      ok: false,
      err: {
        kind: "parse",
        message: "AI response did not contain message content.",
        raw: json,
      },
    };
  }

  const jsonStr = findJson(contentText);
  if (!jsonStr) {
    return {
      ok: false,
      err: {
        kind: "parse",
        message:
          "AI response could not be parsed as structured JSON discovery output.",
        raw: contentText.slice(0, 1500),
      },
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonStr);
  } catch {
    return {
      ok: false,
      err: {
        kind: "parse",
        message: "AI response was not valid JSON.",
        raw: jsonStr.slice(0, 1500),
      },
    };
  }

  return validateDiscoveryResponse(parsed);
}
