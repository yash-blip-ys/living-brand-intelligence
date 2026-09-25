import { resolveAiConfig, type AiProviderConfig, type DiscoveryError } from "@/lib/ai/discovery";
import type { Json } from "@/lib/types/database";

/* ------------------------------------------------------------------ *
 * Founder dialogue: the adaptive Discovery interview and the
 * "challenge the AI's reasoning" loop for brand recommendations.
 *
 * Nothing here writes to the database. Founder decisions stay in the
 * client until the founder explicitly approves them through the
 * existing Discovery / Strategy review actions.
 * ------------------------------------------------------------------ */

export type InterviewAnswer = {
  question: string;
  answer: string;
};

export type InterviewQuestion = {
  question: string;
  why: string | null;
};

/** One compact line in the live "What I'm understanding" panel. */
export type UnderstandingLine = {
  status: "clear" | "open";
  text: string;
};

export type SummaryItem = {
  content: string;
  confidence: number | null;
  source: string | null;
  reasoning: string | null;
};

export type InterviewSummary = {
  facts: SummaryItem[];
  inferences: SummaryItem[];
  hypotheses: SummaryItem[];
};

export type InterviewTurn =
  | {
      stage: "question";
      question: InterviewQuestion;
      understanding: UnderstandingLine[];
      closing: string | null;
    }
  | {
      stage: "summary";
      summary: InterviewSummary;
      scopeQuestion: string | null;
      understanding: UnderstandingLine[];
      closing: string | null;
    };

export type RecommendationChallengeResult = {
  acknowledgement: string;
  resolution: string;
  revised: {
    title: string;
    content: string;
    rationale: string;
    uncertainty: string | null;
  } | null;
};

export type DialogueError = DiscoveryError;

const JSON_START_RE = /^[\sï»¿]*\{/;
const JSON_END_RE = /\}[ï»¿]*$/;

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function findJson(text: string): string | null {
  const trimmed = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  if (JSON_START_RE.test(trimmed) && JSON_END_RE.test(trimmed)) return trimmed;
  const first = trimmed.indexOf("{");
  const last = trimmed.lastIndexOf("}");
  if (first === -1 || last === -1 || last <= first) return null;
  return trimmed.slice(first, last + 1);
}

function confidenceOf(raw: unknown): number | null {
  if (typeof raw !== "number" || !Number.isFinite(raw)) return null;
  const clamped = Math.max(0, Math.min(1, raw));
  return Number(clamped.toFixed(2));
}

function textOf(raw: unknown, max: number): string | null {
  if (typeof raw !== "string") return null;
  const t = raw.trim();
  if (!t) return null;
  return t.slice(0, max);
}

function normalizeSummaryItems(bucket: unknown, limit: number, isFact: boolean): SummaryItem[] {
  if (!Array.isArray(bucket)) return [];
  const out: SummaryItem[] = [];
  for (const raw of bucket) {
    if (out.length >= limit) break;
    if (!isRecord(raw)) continue;
    const content = textOf(raw.content, 600);
    if (!content) continue;
    out.push({
      content,
      confidence: confidenceOf(raw.confidence),
      source: isFact ? "founder_interview" : textOf(raw.source, 120),
      reasoning: textOf(raw.reasoning, 600),
    });
  }
  return out;
}

/* ----------------------------- provider ----------------------------- */

async function callProviderJson(
  cfg: AiProviderConfig,
  system: string,
  user: string,
  maxOutputTokens: number,
): Promise<{ ok: true; json: unknown } | { ok: false; err: DialogueError }> {
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
      system,
      messages: [{ role: "user", content: [{ type: "text", text: user }] }],
    };
  } else if (cfg.provider === "gemini") {
    const base = cfg.endpoint ?? "https://generativelanguage.googleapis.com/v1beta";
    url = `${base}/models/${cfg.model}:generateContent?key=${encodeURIComponent(cfg.apiKey)}`;
    headers = {
      "content-type": "application/json",
      "x-goog-api-client": "living-brand-intelligence-hackathon/1.0",
    };
    body = {
      contents: [{ role: "user", parts: [{ text: `${system}\n\n${user}` }] }],
      generationConfig: {
        temperature: 0.3,
        maxOutputTokens,
        responseMimeType: "application/json",
      },
    };
  } else {
    const base =
      cfg.endpoint ??
      (cfg.provider === "openrouter" ? "https://openrouter.ai/api/v1" : "https://api.openai.com/v1");
    url = `${base}/chat/completions`;
    headers = { "content-type": "application/json", authorization: `Bearer ${cfg.apiKey}` };
    if (cfg.provider === "openrouter") {
      headers["http-referer"] = "https://living-brand-intelligence.local";
      headers["x-title"] = "Living Brand Intelligence (Hackathon MVP)";
    }
    body = {
      model: cfg.model,
      temperature: 0.3,
      max_output_tokens: maxOutputTokens,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
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
    const message = err instanceof Error ? err.message : "Network error contacting AI provider.";
    return { ok: false, err: { kind: "model", message: `Unable to reach AI provider: ${message}` } };
  }

  if (!response.ok) {
    let detail = `HTTP ${response.status}`;
    try {
      const txt = await response.text();
      if (txt) detail += `: ${txt.slice(0, 240)}`;
    } catch {
      /* ignore */
    }
    return { ok: false, err: { kind: "model", message: `AI provider returned an error. ${detail}` } };
  }

  let json: unknown;
  try {
    json = await response.json();
  } catch {
    return { ok: false, err: { kind: "parse", message: "AI provider did not return JSON.", raw: json } };
  }

  let contentText = "";
  if (cfg.provider === "anthropic") {
    const bodyAny = json as Record<string, unknown>;
    const content = bodyAny.content;
    if (Array.isArray(content) && content.length > 0 && isRecord(content[0])) {
      const t = (content[0] as Record<string, unknown>).text;
      if (typeof t === "string") contentText = t;
    }
  } else if (cfg.provider === "gemini") {
    const bodyAny = json as Record<string, unknown>;
    const candidates = bodyAny.candidates;
    if (Array.isArray(candidates) && candidates.length > 0 && isRecord(candidates[0])) {
      const content = (candidates[0] as Record<string, unknown>).content;
      if (isRecord(content) && Array.isArray(content.parts)) {
        const texts: string[] = [];
        for (const p of content.parts) {
          if (isRecord(p) && typeof p.text === "string") texts.push(p.text);
        }
        if (texts.length > 0) contentText = texts.join("");
      }
    }
    if (!contentText) {
      const bodyAny = json as Record<string, unknown>;
      if (typeof bodyAny.errorMessage === "string") {
        return {
          ok: false,
          err: { kind: "model", message: `Gemini returned an error: ${bodyAny.errorMessage}` },
        };
      }
    }
  } else {
    const bodyAny = json as Record<string, unknown>;
    const choices = bodyAny.choices;
    if (Array.isArray(choices) && choices.length > 0 && isRecord(choices[0])) {
      const message = (choices[0] as Record<string, unknown>).message;
      if (isRecord(message) && typeof message.content === "string") contentText = message.content;
    }
  }

  if (!contentText) {
    return { ok: false, err: { kind: "parse", message: "AI response did not contain message content.", raw: json } };
  }
  const jsonStr = findJson(contentText);
  if (!jsonStr) {
    return { ok: false, err: { kind: "parse", message: "AI response was not a JSON object.", raw: contentText.slice(0, 1500) } };
  }
  try {
    return { ok: true, json: JSON.parse(jsonStr) };
  } catch {
    return { ok: false, err: { kind: "parse", message: "AI response was not valid JSON.", raw: jsonStr.slice(0, 1500) } };
  }
}

/* ----------------------------- interview ---------------------------- */

const INTERVIEW_SYSTEM = `You are interviewing someone describing an idea they want to build. They may be a founder, a team member, a creator, a community builder, or a product builder. Never assume which, and never call them "founder".

You are a sharp product and brand strategist having a conversation — not filling out a form. You ask EXACTLY ONE question per turn.

Return exactly ONE JSON object.

STAGE A — ask the next single question
{
  "stage": "question",
  "question": { "text": "one question", "why": "short reason it matters, or null" },
  "understanding": [ { "status": "clear" | "open", "text": "one short line" } ],
  "closing": null
}

STAGE B — summarize
{
  "stage": "summary",
  "closing": "one short sentence you say out loud when you have enough",
  "question": null,
  "scopeQuestion": "one question about scope, or null",
  "facts": [ { "content": "...", "confidence": 0.0-1.0, "source": "interview" } ],
  "inferences": [ { "content": "...", "confidence": 0.0-1.0, "reasoning": "1-2 short sentences" } ],
  "hypotheses": [ { "content": "...", "confidence": 0.0-1.0, "reasoning": "1-2 short sentences" } ],
  "understanding": [ { "status": "clear" | "open", "text": "one short line" } ]
}

COVERAGE (track silently — this is a framework, not a script):
- IDEA / MECHANISM: what they are creating and how it would actually work
- AUDIENCE: who it is specifically for
- CURRENT ALTERNATIVE: what those people use today instead
- PROBLEM: the specific frustration being removed
- REASON TO EXIST: why this needs to exist alongside the alternatives

ADAPTIVE RULES:
- Read the newest answer first, then the whole conversation.
- Decide which single dimension is least understood or most contradicted, and ask about that. Ignore the order above.
- If an answer already covers a dimension, do not ask about it again.
- If the answer contains a contradiction, ask about the contradiction directly.
- If the answer is broad or vague ("helping people", "for students", "to make it easier"), narrow the ambiguity with a question instead of assuming.
- You may end the interview early if the idea is already clear. Usually 4-7 turns is enough, but that is not a target to hit artificially.
- Never repeat a question that was already answered.

QUESTION STYLE (conversational, never form-like):
- Prefer "Who do you imagine using this first?" over "What is your target audience?"
- Prefer "How do these people solve this today?" over "What is the competitive alternative?"
- Prefer "What makes this frustrating today?" over "What pain point are you addressing?"
- Prefer "How do you imagine this actually working?" over "What is the core mechanism?"
- Prefer "What would make someone choose this instead?" over "What is your unfair advantage?"
- One idea per question. Short enough to answer in a sentence or two. Never yes/no. Never multiple choice.

UNCERTAINTY IS USEFUL:
- The person may answer "I'm not sure", "I don't know yet", or "skip".
- If they do, acknowledge it in one short clause and move to a different useful area. Never pressure them to invent an answer.
- Record their uncertainty as an "open" line in "understanding".

UNDERSTANDING PANEL:
- "understanding" is a compact running picture, 2-5 lines, each under 15 words.
- "clear" = the person told you directly. "open" = still undefined, uncertain, or assumed.
- Update it every turn to reflect the current state, not the history.

NEVER BRAND (not yet — that is a later stage):
- No questions or content about brand personality, tagline, visual identity, brand voice, positioning statements, naming, logos, colors, or typography.

NEVER NARROW THE IDEA (critical):
- Never silently turn an ambiguous idea into a narrower business. If they said "help college students find people to collaborate with", do NOT become a "hackathon teammate matching platform". Ask: "When you say collaborate, what are you imagining — projects, hackathons, learning, services, or something else?"
- Never assume an industry, business model, technology, or segment they did not state. If an interpretation would be useful, put it in "inferences" or "hypotheses" and let them confirm it.
- If one segment or use case stands out but you are unsure whether it is the whole idea, put that reading in "inferences" or "hypotheses" and ask about it in "scopeQuestion" (for example: "Hackathons could be an entry point — is that how you see it, or should it stay one use case among several?").
- Once they answer a scope question, include it as a FACT and set "scopeQuestion" to null.

SUMMARY RULES:
- FACT = explicitly stated by them. Never promote an inference or hypothesis into a fact.
- INFERENCE = a reasonable reading of what they said. HYPOTHESIS = plausible but unconfirmed.
- Never invent customers, market size, traction, competitors, pricing, revenue, geography, or technology.
- Prefer fewer, sharper items over padding. 3-7 facts, 0-4 inferences, 0-4 hypotheses.

Respond with ONLY the JSON object.`;

function transcriptBlock(transcript: readonly InterviewAnswer[]): string {
  return transcript
    .map((a, i) => `Q${i + 1}: ${a.question}\nA${i + 1}: ${a.answer}`)
    .join("\n\n");
}

function contextBlock(
  approvedContext: ReadonlyArray<{ id: string; type: string; content: string }>,
): string {
  if (approvedContext.length === 0) return "";
  const lines = approvedContext
    .slice(0, 20)
    .map((c) => `- [${c.type}] ${c.content.replace(/\s+/g, " ").trim()}`);
  return `
ALREADY APPROVED CONTEXT (do not contradict; if a new answer conflicts with it, ask about the conflict):
${lines.join("\n")}
`;
}

function normalizeUnderstanding(raw: unknown): UnderstandingLine[] {
  if (!Array.isArray(raw)) return [];
  const out: UnderstandingLine[] = [];
  for (const entry of raw) {
    if (out.length >= 5) break;
    if (!isRecord(entry)) continue;
    const text = textOf(entry.text, 180);
    if (!text) continue;
    out.push({ status: entry.status === "open" ? "open" : "clear", text });
  }
  return out;
}

function parseTurn(json: unknown): InterviewTurn | null {
  if (!isRecord(json)) return null;

  const understanding = normalizeUnderstanding(json.understanding);

  if (json.stage === "summary") {
    const facts = normalizeSummaryItems(json.facts, 7, true);
    const inferences = normalizeSummaryItems(json.inferences, 4, false);
    const hypotheses = normalizeSummaryItems(json.hypotheses, 4, false);
    if (facts.length === 0 && inferences.length === 0 && hypotheses.length === 0) return null;
    return {
      stage: "summary",
      summary: { facts, inferences, hypotheses },
      scopeQuestion: textOf(json.scopeQuestion, 400),
      understanding,
      closing: textOf(json.closing, 240),
    };
  }

  // Accept the canonical single "question" object, and tolerate a one-item
  // "questions" array from a model that ignored the single-question rule.
  let question: InterviewQuestion | null = null;
  if (isRecord(json.question)) {
    const text = textOf(json.question.text, 400) ?? textOf(json.question.question, 400);
    if (text) question = { question: text, why: textOf(json.question.why, 200) };
  }
  if (!question && Array.isArray(json.questions) && isRecord(json.questions[0])) {
    const first = json.questions[0] as Record<string, unknown>;
    const text = textOf(first.question, 400) ?? textOf(first.text, 400);
    if (text) question = { question: text, why: textOf(first.why, 200) };
  }
  if (!question) return null;

  return {
    stage: "question",
    question,
    understanding,
    closing: null,
  };
}

export async function runInterviewTurn(input: {
  roughIdea: string;
  transcript: readonly InterviewAnswer[];
  approvedContext: ReadonlyArray<{ id: string; type: string; content: string }>;
  forceSummary?: boolean;
}): Promise<{ ok: true; result: InterviewTurn } | { ok: false; err: DialogueError }> {
  const roughIdea = input.roughIdea.trim();
  if (!roughIdea) {
    return { ok: false, err: { kind: "model", message: "No rough idea provided." } };
  }

  const cfgRes = resolveAiConfig();
  if (!cfgRes.ok) return { ok: false, err: { kind: "config", message: cfgRes.message } };

  const userPrompt = `${contextBlock(input.approvedContext)}
THEIR STARTING DESCRIPTION OF THE IDEA:
"""
${roughIdea}
"""

THE CONVERSATION SO FAR:
"""
${transcriptBlock(input.transcript)}
"""
${
  input.forceSummary
    ? "They would like to wrap up. Produce the summary now (STAGE B)."
    : "Decide the single most useful next question from the conversation, or produce the summary if you already understand the idea well enough."
}`;

  const call = await callProviderJson(cfgRes.cfg, INTERVIEW_SYSTEM, userPrompt, 2000);
  if (!call.ok) return call;

  const turn = parseTurn(call.json);
  if (!turn) {
    return {
      ok: false,
      err: {
        kind: "parse",
        message:
          "The interviewer returned an unusable response. Try again — no context was changed.",
        raw: call.json,
      },
    };
  }
  return { ok: true, result: turn };
}

/* --------------------- challenge a recommendation -------------------- */

const CHALLENGE_SYSTEM = `You are the Brand Strategist answering a founder who disagrees with one of your recommendations.

The founder is the decision maker. You do not argue for your original answer and you do not surrender automatically. You reason honestly and you may revise.

Return ONLY this JSON object:
{
  "acknowledgement": "1-2 sentences naming specifically what the founder is right or wrong about. No flattery.",
  "resolution": "2-4 sentences of reasoning: what you weighted, what you are changing, and what you are keeping.",
  "revised": { "title": "...", "content": "...", "rationale": "2-3 short bullets, one per line", "uncertainty": "or null" } | null
}

Rules:
- Use "revised" when the founder's objection materially changes the recommendation.
- Keep "revised" as null only if the founder's objection does not change it — in that case say why in "resolution".
- The revised content must not narrow the startup to a use case, segment, or market the founder did not choose.
- "rationale" lines start with "- ".
- No branding overreach: stay inside the category you were asked about.
- No markdown fences.`;

export async function runRecommendationChallenge(input: {
  category: string;
  title: string;
  content: string;
  rationale: string;
  supportingEvidence: string;
  founderObjection: string;
}): Promise<
  | { ok: true; result: RecommendationChallengeResult }
  | { ok: false; err: DialogueError }
> {
  const objection = input.founderObjection.trim();
  if (!objection) {
    return { ok: false, err: { kind: "model", message: "Tell the AI what you disagree with first." } };
  }

  const cfgRes = resolveAiConfig();
  if (!cfgRes.ok) return { ok: false, err: { kind: "config", message: cfgRes.message } };

  const userPrompt = `DECISION CATEGORY: ${input.category}

YOUR RECOMMENDATION — TITLE:
${input.title}

YOUR RECOMMENDATION — CONTENT:
"""
${input.content}
"""

WHY YOU RECOMMENDED IT:
${input.rationale || "(not provided)"}

APPROVED EVIDENCE IT IS GROUNDED IN:
${input.supportingEvidence || "(not provided)"}

FOUNDER SAYS:
"""
${objection}
"""`;

  const call = await callProviderJson(cfgRes.cfg, CHALLENGE_SYSTEM, userPrompt, 2500);
  if (!call.ok) return call;

  const json = call.json;
  if (!isRecord(json)) {
    return { ok: false, err: { kind: "parse", message: "The response was not a JSON object.", raw: json } };
  }

  const acknowledgement = textOf(json.acknowledgement, 900);
  const resolution = textOf(json.resolution, 1600);
  if (!acknowledgement || !resolution) {
    return {
      ok: false,
      err: { kind: "parse", message: "The response was missing the AI reasoning.", raw: json },
    };
  }

  let revised: RecommendationChallengeResult["revised"] = null;
  const rawRevised = json.revised;
  if (isRecord(rawRevised)) {
    const title = textOf(rawRevised.title, 160);
    const content = textOf(rawRevised.content, 6000);
    if (title && content) {
      revised = {
        title,
        content,
        rationale: textOf(rawRevised.rationale, 2500) ?? "",
        uncertainty: textOf(rawRevised.uncertainty, 600),
      };
    }
  }

  return { ok: true, result: { acknowledgement, resolution, revised } };
}
