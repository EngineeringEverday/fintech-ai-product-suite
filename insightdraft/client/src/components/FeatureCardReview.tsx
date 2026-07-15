import { useState } from 'react';
import type { FeatureCard } from '@/lib/types';
import { ConfidenceBadge } from './ConfidenceBadge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Check, X, Pencil, RotateCcw, AlertTriangle } from 'lucide-react';

interface Props {
  card: FeatureCard;
  onAccept: (id: string) => void;
  onReject: (id: string) => void;
  onEdit: (id: string, patch: Partial<FeatureCard>) => void;
}

export function FeatureCardReview({ card, onAccept, onReject, onEdit }: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<FeatureCard>(card);

  const flagged = card.needs_human_review;
  const status = card.status;

  function saveEdit() {
    onEdit(card.id, {
      feature_name: draft.feature_name,
      user_problem: draft.user_problem,
      proposed_solution: draft.proposed_solution,
      success_metric: draft.success_metric,
      priority_score: Math.max(1, Math.min(10, Number(draft.priority_score) || card.priority_score)),
    });
    setEditing(false);
  }

  const statusBorder =
    status === 'accepted'
      ? 'border-emerald-600/40'
      : status === 'rejected'
      ? 'border-rose-600/40 opacity-60'
      : status === 'edited'
      ? 'border-primary/50'
      : flagged
      ? 'border-amber-600/50'
      : 'border-card-border';

  return (
    <article
      data-testid={`card-feature-${card.id}`}
      data-status={status}
      className={`rounded-lg border bg-card transition-all ${statusBorder}`}
    >
      <div className="p-5">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="min-w-0 flex-1">
            {editing ? (
              <Input
                value={draft.feature_name}
                onChange={(e) => setDraft({ ...draft, feature_name: e.target.value })}
                data-testid={`input-feature-name-${card.id}`}
                className="text-[15px] font-semibold"
              />
            ) : (
              <h3 className="text-[15.5px] font-semibold tracking-tight leading-snug" data-testid={`text-feature-name-${card.id}`}>
                {card.feature_name}
              </h3>
            )}
            <div className="mt-2 flex items-center flex-wrap gap-1.5">
              <span
                className="inline-flex items-center gap-1 rounded-full bg-primary/10 text-primary px-2 py-0.5 text-[11.5px] font-medium tabular-nums"
                data-testid={`badge-priority-${card.id}`}
              >
                Priority {card.priority_score}/10
              </span>
              <ConfidenceBadge score={card.confidence_score} label="Confidence" />
              {flagged && (
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/14 text-amber-800 dark:text-amber-200 ring-1 ring-inset ring-amber-600/30 px-2 py-0.5 text-[11px] font-medium" data-testid={`flag-review-${card.id}`}>
                  <AlertTriangle className="w-3 h-3" />
                  Needs review
                </span>
              )}
              <StatusTag status={status} />
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="space-y-3">
          <Field
            label="User problem"
            value={editing ? draft.user_problem : card.user_problem}
            editing={editing}
            multiline
            onChange={(v) => setDraft({ ...draft, user_problem: v })}
            testid={`field-user-problem-${card.id}`}
          />
          <Field
            label="Proposed solution"
            value={editing ? draft.proposed_solution : card.proposed_solution}
            editing={editing}
            multiline
            onChange={(v) => setDraft({ ...draft, proposed_solution: v })}
            testid={`field-solution-${card.id}`}
          />
          <Field
            label="Success metric"
            value={editing ? draft.success_metric : card.success_metric}
            editing={editing}
            multiline
            onChange={(v) => setDraft({ ...draft, success_metric: v })}
            testid={`field-metric-${card.id}`}
          />
          {editing && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-[12px] font-medium uppercase tracking-wide text-muted-foreground">
                  Priority (1–10)
                </Label>
                <Input
                  type="number"
                  min={1}
                  max={10}
                  value={draft.priority_score}
                  onChange={(e) => setDraft({ ...draft, priority_score: Number(e.target.value) })}
                  data-testid={`input-priority-${card.id}`}
                  className="mt-1"
                />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-card-border bg-muted/30 rounded-b-lg">
        {editing ? (
          <>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => { setEditing(false); setDraft(card); }}
              data-testid={`button-cancel-edit-${card.id}`}
            >
              Cancel
            </Button>
            <Button size="sm" onClick={saveEdit} data-testid={`button-save-edit-${card.id}`}>
              <Check className="w-3.5 h-3.5 mr-1" /> Save
            </Button>
          </>
        ) : status === 'pending' ? (
          <>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onReject(card.id)}
              data-testid={`button-reject-${card.id}`}
              className="text-rose-700 dark:text-rose-300"
            >
              <X className="w-3.5 h-3.5 mr-1" /> Reject
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => { setEditing(true); setDraft(card); }}
              data-testid={`button-edit-${card.id}`}
            >
              <Pencil className="w-3.5 h-3.5 mr-1" /> Edit
            </Button>
            <Button
              size="sm"
              onClick={() => onAccept(card.id)}
              data-testid={`button-accept-${card.id}`}
            >
              <Check className="w-3.5 h-3.5 mr-1" /> Accept
            </Button>
          </>
        ) : (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onEdit(card.id, { status: 'pending' })}
            data-testid={`button-reset-${card.id}`}
            className="text-muted-foreground"
          >
            <RotateCcw className="w-3.5 h-3.5 mr-1" /> Reset
          </Button>
        )}
      </div>
    </article>
  );
}

function StatusTag({ status }: { status: FeatureCard['status'] }) {
  if (status === 'pending') return null;
  const styles: Record<string, string> = {
    accepted: 'bg-emerald-500/12 text-emerald-700 dark:text-emerald-300 ring-1 ring-inset ring-emerald-600/30',
    rejected: 'bg-rose-500/12 text-rose-700 dark:text-rose-300 ring-1 ring-inset ring-rose-600/30',
    edited: 'bg-primary/12 text-primary ring-1 ring-inset ring-primary/30',
  };
  const label = status === 'accepted' ? 'Accepted' : status === 'rejected' ? 'Rejected' : 'Edited';
  return (
    <span
      data-testid={`status-tag-${status}`}
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${styles[status]}`}
    >
      {label}
    </span>
  );
}

interface FieldProps {
  label: string;
  value: string;
  editing: boolean;
  multiline?: boolean;
  onChange: (v: string) => void;
  testid?: string;
}

function Field({ label, value, editing, multiline, onChange, testid }: FieldProps) {
  return (
    <div>
      <Label className="text-[11.5px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </Label>
      {editing ? (
        multiline ? (
          <Textarea
            value={value}
            onChange={(e) => onChange(e.target.value)}
            rows={3}
            data-testid={testid}
            className="mt-1 text-[13.5px]"
          />
        ) : (
          <Input
            value={value}
            onChange={(e) => onChange(e.target.value)}
            data-testid={testid}
            className="mt-1"
          />
        )
      ) : (
        <p className="mt-1 text-[13.5px] leading-relaxed text-foreground/90" data-testid={testid}>
          {value}
        </p>
      )}
    </div>
  );
}
