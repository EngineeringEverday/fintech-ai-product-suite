import type { ParsedReview, TaggedReview, ClusterSynthesis } from "./types";

const MODEL = "claude-sonnet-4-20250514";
const ENDPOINT = "https://api.anthropic.com/v1/messages";

const PARSE_PROMPT = `You are a data parser. Parse each review into structured JSON.
For each return: {review_id, date (if present, else null), raw_text}.
Return only a JSON array. No preamble.`;

const TAG_PROMPT = `You are a product analyst. For each review extract: {review_id,
sentiment (positive/negative/neutral), sentiment_score (-1.0 to 1.0),
core_insight (one sentence max), intensity (High/Med/Low),
theme_cluster (assign exactly one of: Performance, UX/Design, Pricing,
Support, Reliability, Onboarding, Features)}.
Return only a JSON array. No preamble.`;

const SYNTH_PROMPT = `You are a senior PM. Given these tagged reviews, summarize each 
cluster: {cluster_name, review_count, avg_sentiment_score,
top_complaints (array of 3), top_praises (array of 3),
trend (improving/worsening/stable), recommended_action,
priority_score (1-10)}.
Return only a JSON array. No preamble.`;

export class ClaudeError extends Error {
  kind: "cors" | "auth" | "rate" | "network" | "parse" | "api";
  status?: number;
  constructor(message: string, kind: ClaudeError["kind"], status?: number) {
    super(message);
    this.kind = kind;
    this.status = status;
  }
}

async function call(apiKey: string, systemPrompt: string, userContent: string): Promise<string> {
  let resp: Response;
  try {
    resp = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        // Required to call Anthropic directly from a browser
        "anthropic-dangerous-direct-browser-access": "true",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 8000,
        system: systemPrompt,
        messages: [{ role: "user", content: userContent }],
      }),
    });
  } catch (e) {
    // Network / CORS failures land here as TypeError "Failed to fetch"
    throw new ClaudeError(
      "Browser blocked the request to Anthropic (likely CORS or network). The Anthropic API may not allow direct browser calls from this origin. Use the sample data path, or run this through a CORS-permissive proxy.",
      "cors"
    );
  }

  if (!resp.ok) {
    let detail = "";
    try { detail = JSON.stringify(await resp.json()); } catch { /* ignore */ }
    if (resp.status === 401 || resp.status === 403) {
      throw new ClaudeError("Invalid or unauthorized API key.", "auth", resp.status);
    }
    if (resp.status === 429) {
      throw new ClaudeError("Rate limited by Anthropic. Wait a moment and retry.", "rate", resp.status);
    }
    throw new ClaudeError(`Anthropic API error ${resp.status}: ${detail}`, "api", resp.status);
  }

  const data = await resp.json();
  const text = (data?.content ?? [])
    .filter((b: { type?: string }) => b.type === "text")
    .map((b: { text?: string }) => b.text)
    .join("\n");
  if (!text) throw new ClaudeError("Empty response from Anthropic.", "parse");
  return text;
}

// Robust JSON extraction — strip fences, find first `[`, last `]`.
export function extractJsonArray<T>(raw: string): T[] {
  let s = raw.trim();
  // Strip code fences if present
  s = s.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
  // Find array bounds
  const start = s.indexOf("[");
  const end = s.lastIndexOf("]");
  if (start === -1 || end === -1 || end <= start) {
    throw new ClaudeError("Could not find a JSON array in the model response.", "parse");
  }
  const candidate = s.slice(start, end + 1);
  try {
    return JSON.parse(candidate) as T[];
  } catch (e) {
    throw new ClaudeError("Model returned malformed JSON.", "parse");
  }
}

export async function runParser(apiKey: string, rawInput: string): Promise<ParsedReview[]> {
  const text = await call(apiKey, PARSE_PROMPT, rawInput);
  return extractJsonArray<ParsedReview>(text);
}

export async function runTagger(apiKey: string, parsed: ParsedReview[]): Promise<TaggedReview[]> {
  const text = await call(apiKey, TAG_PROMPT, JSON.stringify(parsed));
  return extractJsonArray<TaggedReview>(text);
}

export async function runSynth(apiKey: string, tagged: TaggedReview[]): Promise<ClusterSynthesis[]> {
  const text = await call(apiKey, SYNTH_PROMPT, JSON.stringify(tagged));
  return extractJsonArray<ClusterSynthesis>(text);
}
