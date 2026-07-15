// Frontend-only Anthropic Messages API calls.
// NOTE: browsers block direct calls to api.anthropic.com unless the user's key is
// served with explicit CORS headers. The Anthropic dashboard allows enabling
// "anthropic-dangerous-direct-browser-access" — we set that header so users with
// that workspace setting on can use their key directly. If CORS still blocks, we
// surface a polished error state and recommend demo mode.

export const ANTHROPIC_MODEL = 'claude-sonnet-4-20250514';
const ANTHROPIC_ENDPOINT = 'https://api.anthropic.com/v1/messages';

export class AnthropicError extends Error {
  constructor(message: string, public kind: 'cors' | 'auth' | 'rate' | 'parse' | 'network' | 'unknown') {
    super(message);
  }
}

export interface AgentCallParams {
  apiKey: string;
  system: string;
  userMessage: string;
  maxTokens?: number;
}

export async function callAgent({ apiKey, system, userMessage, maxTokens = 4096 }: AgentCallParams): Promise<unknown[]> {
  let response: Response;
  try {
    response = await fetch(ANTHROPIC_ENDPOINT, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: ANTHROPIC_MODEL,
        max_tokens: maxTokens,
        system,
        messages: [{ role: 'user', content: userMessage }],
      }),
    });
  } catch (e) {
    // Most likely CORS, network, or DNS failure — fetch throws TypeError on CORS
    throw new AnthropicError(
      'Could not reach the Anthropic API from the browser. This is almost always a CORS restriction — direct frontend calls are not always permitted. Try Demo Mode to see the full flow.',
      'cors'
    );
  }

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    if (response.status === 401 || response.status === 403) {
      throw new AnthropicError('Anthropic rejected the API key. Check that it begins with sk-ant- and has access to claude-sonnet-4-20250514.', 'auth');
    }
    if (response.status === 429) {
      throw new AnthropicError('Anthropic rate limit hit. Wait a minute and try again, or switch to Demo Mode.', 'rate');
    }
    throw new AnthropicError(`Anthropic API error ${response.status}: ${text.slice(0, 200)}`, 'unknown');
  }

  const data = await response.json();
  const textBlock = data?.content?.find((b: { type: string }) => b.type === 'text');
  if (!textBlock?.text) {
    throw new AnthropicError('Unexpected response shape from Anthropic.', 'parse');
  }

  // Extract JSON array — agents are instructed to return only a JSON array, but be defensive
  const text = textBlock.text as string;
  const arr = extractJSONArray(text);
  if (!arr) {
    throw new AnthropicError('The model did not return a valid JSON array. Retry, or switch to Demo Mode.', 'parse');
  }
  return arr;
}

function extractJSONArray(text: string): unknown[] | null {
  // Try direct parse
  const trimmed = text.trim();
  try {
    const v = JSON.parse(trimmed);
    if (Array.isArray(v)) return v;
  } catch {/* fallthrough */}

  // Strip code fences if present
  const fenced = trimmed.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
  try {
    const v = JSON.parse(fenced);
    if (Array.isArray(v)) return v;
  } catch {/* fallthrough */}

  // Find first [ ... last ]
  const start = text.indexOf('[');
  const end = text.lastIndexOf(']');
  if (start !== -1 && end > start) {
    try {
      const v = JSON.parse(text.slice(start, end + 1));
      if (Array.isArray(v)) return v;
    } catch {/* fallthrough */}
  }
  return null;
}
