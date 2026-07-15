import { confidenceTone } from '@/lib/util';

interface Props {
  score: number;
  label?: string;
  testid?: string;
}

const TONE_STYLES: Record<'green' | 'amber' | 'red', string> = {
  green:
    'bg-emerald-500/12 text-emerald-700 dark:text-emerald-300 ring-1 ring-inset ring-emerald-600/25',
  amber:
    'bg-amber-500/14 text-amber-800 dark:text-amber-200 ring-1 ring-inset ring-amber-600/30',
  red:
    'bg-rose-500/12 text-rose-700 dark:text-rose-300 ring-1 ring-inset ring-rose-600/30',
};

export function ConfidenceBadge({ score, label = 'Confidence', testid }: Props) {
  const tone = confidenceTone(score);
  return (
    <span
      data-testid={testid ?? `badge-confidence-${tone}`}
      className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11.5px] font-medium tabular-nums ${TONE_STYLES[tone]}`}
    >
      <span className="w-1.5 h-1.5 rounded-full bg-current opacity-70" />
      {label} {score}
    </span>
  );
}

const SEV_STYLES: Record<'High' | 'Med' | 'Low', string> = {
  High: 'bg-rose-500/12 text-rose-700 dark:text-rose-300 ring-1 ring-inset ring-rose-600/30',
  Med: 'bg-amber-500/14 text-amber-800 dark:text-amber-200 ring-1 ring-inset ring-amber-600/30',
  Low: 'bg-muted text-muted-foreground ring-1 ring-inset ring-border',
};

export function SeverityBadge({ severity }: { severity: 'High' | 'Med' | 'Low' }) {
  return (
    <span
      data-testid={`badge-severity-${severity.toLowerCase()}`}
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${SEV_STYLES[severity]}`}
    >
      {severity}
    </span>
  );
}
