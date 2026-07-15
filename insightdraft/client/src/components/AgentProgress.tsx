import type { AgentStage } from '@/lib/types';
import { Check, Loader2 } from 'lucide-react';

interface Props {
  stage: AgentStage;
}

const STEPS: { key: Exclude<AgentStage, 'idle' | 'done'>; label: string; sub: string }[] = [
  { key: 'researcher', label: 'Researcher', sub: 'Extracts pain points' },
  { key: 'synthesis', label: 'Synthesis', sub: 'Clusters into themes' },
  { key: 'strategy', label: 'Strategy', sub: 'Drafts PRD cards' },
  { key: 'review', label: 'Review', sub: 'Human-in-the-loop' },
];

function indexOf(stage: AgentStage): number {
  switch (stage) {
    case 'researcher': return 0;
    case 'synthesis': return 1;
    case 'strategy': return 2;
    case 'review': return 3;
    case 'done': return 4;
    default: return -1;
  }
}

export function AgentProgress({ stage }: Props) {
  const active = indexOf(stage);
  return (
    <ol
      role="list"
      data-testid="agent-progress"
      className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-border rounded-md overflow-hidden border border-border"
    >
      {STEPS.map((step, i) => {
        const isDone = i < active;
        const isActive = i === active;
        const isPending = i > active;
        return (
          <li
            key={step.key}
            data-testid={`progress-step-${step.key}`}
            data-state={isDone ? 'done' : isActive ? 'active' : 'pending'}
            className={`relative bg-card px-4 py-3 flex items-start gap-3 ${
              isPending ? 'opacity-55' : ''
            }`}
          >
            <span
              className={`mt-0.5 flex h-6 w-6 items-center justify-center rounded-full border text-[11px] font-semibold tabular-nums ${
                isDone
                  ? 'bg-primary text-primary-foreground border-primary'
                  : isActive
                  ? 'border-primary text-primary'
                  : 'border-border text-muted-foreground'
              }`}
              aria-hidden
            >
              {isDone ? (
                <Check className="w-3.5 h-3.5" />
              ) : isActive ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                i + 1
              )}
            </span>
            <div className="min-w-0">
              <div className="text-[13px] font-medium leading-tight">{step.label}</div>
              <div className="text-[11.5px] text-muted-foreground leading-snug mt-0.5">
                {step.sub}
              </div>
            </div>
            {isActive && (
              <span className="absolute right-3 top-3 w-1.5 h-1.5 rounded-full bg-primary pulse-dot" aria-hidden />
            )}
          </li>
        );
      })}
    </ol>
  );
}
