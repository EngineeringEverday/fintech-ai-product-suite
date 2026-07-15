export function uid(prefix = 'id'): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}`;
}

export function clampScore(n: unknown, lo = 0, hi = 100): number {
  const v = typeof n === 'number' ? n : Number(n);
  if (!Number.isFinite(v)) return 0;
  return Math.max(lo, Math.min(hi, Math.round(v)));
}

export function confidenceTone(score: number): 'green' | 'amber' | 'red' {
  if (score >= 80) return 'green';
  if (score >= 50) return 'amber';
  return 'red';
}
