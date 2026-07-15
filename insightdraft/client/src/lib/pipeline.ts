import { callAgent, AnthropicError } from './anthropic';
import { RESEARCHER_SYSTEM, SYNTHESIS_SYSTEM, STRATEGY_SYSTEM } from './prompts';
import type { PainPoint, Theme, FeatureCard } from './types';
import { clampScore, uid } from './util';
import { DEMO_PAIN_POINTS, DEMO_THEMES, DEMO_CARDS, delay } from './demo';

export interface PipelineCallbacks {
  onPainPoints: (p: PainPoint[]) => void;
  onThemes: (t: Theme[]) => void;
  onCards: (c: FeatureCard[]) => void;
  onStage: (s: 'researcher' | 'synthesis' | 'strategy' | 'review') => void;
  onError: (msg: string, kind: AnthropicError['kind'] | 'demo') => void;
}

function normalizeSeverity(s: unknown): 'High' | 'Med' | 'Low' {
  const v = String(s ?? '').toLowerCase();
  if (v.startsWith('h')) return 'High';
  if (v.startsWith('l')) return 'Low';
  return 'Med';
}

function asString(x: unknown, fallback = ''): string {
  return typeof x === 'string' ? x : x == null ? fallback : String(x);
}

function asStringArray(x: unknown): string[] {
  if (Array.isArray(x)) return x.map((y) => asString(y)).filter(Boolean);
  return [];
}

function normalizePainPoints(arr: unknown[]): PainPoint[] {
  return arr.map((r) => {
    const o = (r ?? {}) as Record<string, unknown>;
    return {
      id: uid('pp'),
      quote: asString(o.quote),
      pain_point: asString(o.pain_point),
      severity: normalizeSeverity(o.severity),
      frequency_estimate: asString(o.frequency_estimate),
      confidence_score: clampScore(o.confidence_score),
    };
  }).filter((p) => p.pain_point);
}

function normalizeThemes(arr: unknown[]): Theme[] {
  return arr.map((r) => {
    const o = (r ?? {}) as Record<string, unknown>;
    return {
      id: uid('th'),
      theme_name: asString(o.theme_name),
      summary: asString(o.summary),
      supporting_pain_points: asStringArray(o.supporting_pain_points),
      assumptions: asStringArray(o.assumptions),
      confidence_score: clampScore(o.confidence_score),
    };
  }).filter((t) => t.theme_name);
}

function normalizeCards(arr: unknown[]): FeatureCard[] {
  return arr.map((r) => {
    const o = (r ?? {}) as Record<string, unknown>;
    const confidence = clampScore(o.confidence_score);
    const needsReview = Boolean(o.needs_human_review) || confidence < 70;
    return {
      id: uid('card'),
      feature_name: asString(o.feature_name),
      user_problem: asString(o.user_problem),
      proposed_solution: asString(o.proposed_solution),
      success_metric: asString(o.success_metric),
      priority_score: clampScore(o.priority_score, 1, 10),
      confidence_score: confidence,
      needs_human_review: needsReview,
      status: 'pending' as const,
    };
  }).filter((c) => c.feature_name);
}

export async function runLivePipeline(
  apiKey: string,
  cleanedInput: string,
  cb: PipelineCallbacks
): Promise<{ ok: boolean }> {
  try {
    cb.onStage('researcher');
    const raw1 = await callAgent({ apiKey, system: RESEARCHER_SYSTEM, userMessage: cleanedInput });
    const painPoints = normalizePainPoints(raw1);
    if (painPoints.length === 0) {
      cb.onError('The Researcher agent returned no usable pain points. Try richer input or Demo Mode.', 'parse');
      return { ok: false };
    }
    cb.onPainPoints(painPoints);

    cb.onStage('synthesis');
    const raw2 = await callAgent({
      apiKey,
      system: SYNTHESIS_SYSTEM,
      userMessage: JSON.stringify(painPoints.map(({ id: _, ...rest }) => rest), null, 2),
    });
    const themes = normalizeThemes(raw2);
    if (themes.length === 0) {
      cb.onError('The Synthesis agent returned no usable themes.', 'parse');
      return { ok: false };
    }
    cb.onThemes(themes);

    cb.onStage('strategy');
    const raw3 = await callAgent({
      apiKey,
      system: STRATEGY_SYSTEM,
      userMessage: JSON.stringify(themes.map(({ id: _, ...rest }) => rest), null, 2),
    });
    const cards = normalizeCards(raw3);
    if (cards.length === 0) {
      cb.onError('The Strategy agent returned no usable PRD cards.', 'parse');
      return { ok: false };
    }
    cb.onCards(cards);

    cb.onStage('review');
    return { ok: true };
  } catch (e) {
    if (e instanceof AnthropicError) {
      cb.onError(e.message, e.kind);
    } else {
      cb.onError((e as Error).message || 'Unknown error in the agent pipeline.', 'unknown');
    }
    return { ok: false };
  }
}

export async function runDemoPipeline(cb: PipelineCallbacks): Promise<{ ok: boolean }> {
  cb.onStage('researcher');
  await delay(950);
  const painPoints: PainPoint[] = DEMO_PAIN_POINTS.map((p) => ({ ...p, id: uid('pp') }));
  cb.onPainPoints(painPoints);

  await delay(450);
  cb.onStage('synthesis');
  await delay(900);
  const themes: Theme[] = DEMO_THEMES.map((t) => ({ ...t, id: uid('th') }));
  cb.onThemes(themes);

  await delay(450);
  cb.onStage('strategy');
  await delay(900);
  const cards: FeatureCard[] = DEMO_CARDS.map((c) => ({ ...c, id: uid('card'), status: 'pending' as const }));
  cb.onCards(cards);

  await delay(250);
  cb.onStage('review');
  return { ok: true };
}
