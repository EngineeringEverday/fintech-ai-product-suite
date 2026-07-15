import type { PainPoint } from '@/lib/types';
import { ConfidenceBadge, SeverityBadge } from './ConfidenceBadge';

export function PainPointsPanel({ items }: { items: PainPoint[] }) {
  return (
    <div className="space-y-2" data-testid="panel-painpoints">
      {items.map((p, i) => (
        <div
          key={p.id}
          data-testid={`painpoint-${p.id}`}
          className="reveal-up rounded-md border border-card-border bg-card p-4"
          style={{ animationDelay: `${i * 60}ms` }}
        >
          <div className="flex items-start justify-between gap-3 mb-2">
            <p className="text-[14px] font-medium leading-snug flex-1">{p.pain_point}</p>
            <div className="flex items-center gap-1.5 shrink-0">
              <SeverityBadge severity={p.severity} />
              <ConfidenceBadge score={p.confidence_score} label="" />
            </div>
          </div>
          <blockquote className="text-[13px] text-muted-foreground italic border-l-2 border-border pl-3 my-2">
            "{p.quote}"
          </blockquote>
          <div className="text-[12px] text-muted-foreground mt-2">
            <span className="font-medium text-foreground/80">Frequency:</span>{' '}
            {p.frequency_estimate}
          </div>
        </div>
      ))}
    </div>
  );
}
