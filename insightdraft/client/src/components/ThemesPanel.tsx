import type { Theme } from '@/lib/types';
import { ConfidenceBadge } from './ConfidenceBadge';
import { useState } from 'react';
import { ChevronDown, AlertCircle } from 'lucide-react';

export function ThemesPanel({ items }: { items: Theme[] }) {
  return (
    <div className="space-y-2" data-testid="panel-themes">
      {items.map((t, i) => (
        <ThemeCard key={t.id} theme={t} delay={i * 60} />
      ))}
    </div>
  );
}

function ThemeCard({ theme, delay }: { theme: Theme; delay: number }) {
  const [open, setOpen] = useState(false);
  return (
    <div
      data-testid={`theme-${theme.id}`}
      className="reveal-up rounded-md border border-card-border bg-card p-4"
      style={{ animationDelay: `${delay}ms` }}
    >
      <div className="flex items-start justify-between gap-3 mb-2">
        <h4 className="text-[14.5px] font-semibold tracking-tight">{theme.theme_name}</h4>
        <ConfidenceBadge score={theme.confidence_score} label="" />
      </div>
      <p className="text-[13.5px] leading-relaxed text-foreground/85">{theme.summary}</p>
      {theme.assumptions?.length > 0 && (
        <div className="mt-3">
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            data-testid={`button-toggle-assumptions-${theme.id}`}
            aria-expanded={open}
            className="inline-flex items-center gap-1.5 text-[12px] font-medium text-amber-700 dark:text-amber-300 hover:underline"
          >
            <AlertCircle className="w-3.5 h-3.5" />
            {theme.assumptions.length} assumption{theme.assumptions.length === 1 ? '' : 's'} to validate
            <ChevronDown className={`w-3.5 h-3.5 transition-transform ${open ? 'rotate-180' : ''}`} />
          </button>
          {open && (
            <ul className="mt-2 space-y-1 text-[12.5px] text-muted-foreground rounded-md bg-amber-500/8 border border-amber-600/20 px-3 py-2">
              {theme.assumptions.map((a, idx) => (
                <li key={idx} className="flex gap-2">
                  <span className="text-amber-700 dark:text-amber-300 mt-1">•</span>
                  <span>{a}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
