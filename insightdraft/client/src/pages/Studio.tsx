import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { AgentProgress } from '@/components/AgentProgress';
import { PainPointsPanel } from '@/components/PainPointsPanel';
import { ThemesPanel } from '@/components/ThemesPanel';
import { FeatureCardReview } from '@/components/FeatureCardReview';
import { SAMPLE_TRANSCRIPT } from '@/lib/sample';
import { stripPII, totalPII } from '@/lib/pii';
import { runDemoPipeline, runLivePipeline } from '@/lib/pipeline';
import type { AgentStage, FeatureCard, PainPoint, Theme } from '@/lib/types';
import { getJSON, setJSON } from '@/lib/storage';
import { getStoredKey } from '@/components/SettingsDialog';
import {
  Sparkles, Play, RefreshCw, FileText, Copy, Download,
  ShieldCheck, AlertCircle, FlaskConical
} from 'lucide-react';
import { toMarkdown, downloadBlob, copyToClipboard } from '@/lib/exporter';

const STATE_KEY = 'insightdraft.run.v1';

interface PersistedRun {
  rawInput: string;
  cleanedInput: string;
  piiCounts: ReturnType<typeof stripPII>['counts'] | null;
  painPoints: PainPoint[];
  themes: Theme[];
  cards: FeatureCard[];
  stage: AgentStage;
  mode: 'live' | 'demo';
}

const INITIAL: PersistedRun = {
  rawInput: '',
  cleanedInput: '',
  piiCounts: null,
  painPoints: [],
  themes: [],
  cards: [],
  stage: 'idle',
  mode: 'demo',
};

export function Studio() {
  const { toast } = useToast();
  const [state, setStateRaw] = useState<PersistedRun>(() => getJSON<PersistedRun>(STATE_KEY, INITIAL));
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<{ msg: string; kind: string } | null>(null);

  // Persist state on every change
  useEffect(() => {
    setJSON(STATE_KEY, state);
  }, [state]);

  const patch = useCallback((p: Partial<PersistedRun>) => {
    setStateRaw((s) => ({ ...s, ...p }));
  }, []);

  const reviewRef = useRef<HTMLDivElement>(null);

  // PII preview on input change
  const piiPreview = useMemo(() => {
    if (!state.rawInput.trim()) return null;
    return stripPII(state.rawInput);
  }, [state.rawInput]);

  async function start(mode: 'live' | 'demo') {
    if (!state.rawInput.trim()) {
      toast({
        title: 'Add some research first',
        description: 'Paste a transcript, ticket bundle, or thread — or use Load sample.',
      });
      return;
    }
    setError(null);
    setRunning(true);

    const { cleaned, counts } = stripPII(state.rawInput);
    patch({
      cleanedInput: cleaned,
      piiCounts: counts,
      painPoints: [],
      themes: [],
      cards: [],
      stage: 'researcher',
      mode,
    });

    const cb = {
      onPainPoints: (pp: PainPoint[]) => patch({ painPoints: pp }),
      onThemes: (t: Theme[]) => patch({ themes: t }),
      onCards: (c: FeatureCard[]) => patch({ cards: c }),
      onStage: (s: 'researcher' | 'synthesis' | 'strategy' | 'review') => patch({ stage: s }),
      onError: (msg: string, kind: string) => setError({ msg, kind }),
    };

    let ok = false;
    if (mode === 'demo') {
      const r = await runDemoPipeline(cb);
      ok = r.ok;
    } else {
      const key = getStoredKey();
      if (!key) {
        setError({
          msg: 'Add your Anthropic API key in Settings, or run in Demo Mode.',
          kind: 'auth',
        });
        patch({ stage: 'idle' });
        setRunning(false);
        return;
      }
      const r = await runLivePipeline(key, cleaned, cb);
      ok = r.ok;
    }

    setRunning(false);
    if (ok) {
      patch({ stage: 'review' });
      // Scroll to review
      setTimeout(() => reviewRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 200);
    } else {
      patch({ stage: 'idle' });
    }
  }

  function reset() {
    setError(null);
    setRunning(false);
    setStateRaw({ ...INITIAL });
  }

  function loadSample() {
    patch({ rawInput: SAMPLE_TRANSCRIPT });
    toast({ title: 'Sample loaded', description: 'Synthetic interview + tickets + Reddit thread.' });
  }

  function setCard(id: string, p: Partial<FeatureCard>) {
    patch({
      cards: state.cards.map((c) =>
        c.id === id
          ? { ...c, ...p, status: p.status ?? (p.feature_name || p.user_problem || p.proposed_solution || p.success_metric || p.priority_score !== undefined ? 'edited' : c.status) }
          : c
      ),
    });
  }

  const acceptedCount = state.cards.filter((c) => c.status === 'accepted' || c.status === 'edited').length;
  const pendingCount = state.cards.filter((c) => c.status === 'pending').length;
  const showResults = state.stage !== 'idle';

  async function copyMd() {
    const md = toMarkdown({
      cards: state.cards,
      themes: state.themes,
      painPoints: state.painPoints,
      generatedAt: new Date(),
      mode: state.mode,
    });
    const ok = await copyToClipboard(md);
    toast({
      title: ok ? 'Copied to clipboard' : 'Could not copy',
      description: ok ? 'Markdown PRD ready to paste.' : 'Try the Download .md option.',
    });
  }

  function downloadMd() {
    const md = toMarkdown({
      cards: state.cards,
      themes: state.themes,
      painPoints: state.painPoints,
      generatedAt: new Date(),
      mode: state.mode,
    });
    const ts = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
    downloadBlob(`insightdraft-prd-${ts}.md`, md);
  }

  return (
    <div className="max-w-[1080px] mx-auto px-6 py-10 sm:py-14">
      {/* Hero */}
      <section className="mb-10">
        <div className="inline-flex items-center gap-1.5 rounded-full bg-primary/8 text-primary px-2.5 py-1 text-[11.5px] font-medium ring-1 ring-inset ring-primary/20 mb-5">
          <Sparkles className="w-3 h-3" />
          Chain-of-agents · Claude Sonnet 4
        </div>
        <h1 className="font-display text-[44px] sm:text-[56px] leading-[1.04] tracking-tight max-w-[18ch]">
          From raw research<br />
          to a <em className="not-italic text-primary">defensible</em> PRD.
        </h1>
        <p className="mt-4 text-[15.5px] text-muted-foreground max-w-[58ch] leading-relaxed">
          Paste an interview transcript, a bundle of support tickets, or a Reddit
          thread. Three AI agents read, cluster, and draft. You review.
          You ship what you trust.
        </p>
      </section>

      {/* Input card */}
      <section className="rounded-xl border border-card-border bg-card shadow-sm overflow-hidden">
        <div className="px-5 py-3 border-b border-card-border bg-muted/30 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4 text-muted-foreground" />
            <span className="text-[13px] font-medium">Raw research</span>
            {piiPreview && totalPII(piiPreview.counts) > 0 && (
              <span
                className="ml-1 inline-flex items-center gap-1 rounded-full bg-emerald-500/12 text-emerald-700 dark:text-emerald-300 ring-1 ring-inset ring-emerald-600/25 px-2 py-0.5 text-[10.5px] font-medium"
                data-testid="badge-pii-detected"
                title="PII redacted before sending to Anthropic"
              >
                <ShieldCheck className="w-3 h-3" />
                {totalPII(piiPreview.counts)} PII redacted
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5">
            <Button
              variant="ghost"
              size="sm"
              onClick={loadSample}
              data-testid="button-load-sample"
              className="text-[12.5px] h-8"
            >
              <Sparkles className="w-3.5 h-3.5 mr-1.5" />
              Load sample
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={reset}
              data-testid="button-reset"
              className="text-[12.5px] h-8 text-muted-foreground"
            >
              <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
              Reset
            </Button>
          </div>
        </div>
        <Textarea
          value={state.rawInput}
          onChange={(e) => patch({ rawInput: e.target.value })}
          placeholder="Paste an interview transcript, a batch of support tickets, a Reddit thread, survey responses — anything qualitative."
          rows={10}
          data-testid="input-raw-research"
          className="rounded-none border-0 focus-visible:ring-0 resize-y min-h-[200px] font-mono text-[13px] leading-relaxed bg-transparent"
        />
        <div className="px-5 py-3 border-t border-card-border bg-muted/30 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="text-[11.5px] text-muted-foreground flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5" />
            Emails, phones, URLs, and common names are stripped on this device
            before any API call.{' '}
            <a href="#/privacy" className="text-primary hover:underline">Policy</a>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              onClick={() => start('demo')}
              disabled={running}
              data-testid="button-run-demo"
            >
              <FlaskConical className="w-4 h-4 mr-1.5" />
              Run in Demo Mode
            </Button>
            <Button
              onClick={() => start('live')}
              disabled={running}
              data-testid="button-run-live"
            >
              <Play className="w-4 h-4 mr-1.5" />
              Run with Claude
            </Button>
          </div>
        </div>
      </section>

      {/* Error */}
      {error && (
        <div
          role="alert"
          data-testid="alert-pipeline-error"
          className="mt-6 rounded-lg border border-rose-600/30 bg-rose-500/8 px-4 py-3 flex items-start gap-3"
        >
          <AlertCircle className="w-4 h-4 mt-0.5 text-rose-700 dark:text-rose-300 shrink-0" />
          <div className="flex-1">
            <div className="text-[13.5px] font-medium text-rose-800 dark:text-rose-200">
              {error.kind === 'cors' ? 'Browser blocked the API call' : error.kind === 'auth' ? 'API key issue' : 'Pipeline error'}
            </div>
            <div className="text-[12.5px] text-rose-700 dark:text-rose-300 mt-0.5 leading-relaxed">
              {error.msg}
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => start('demo')}
            className="shrink-0"
            data-testid="button-retry-demo"
          >
            Try Demo Mode
          </Button>
        </div>
      )}

      {/* Pipeline */}
      {showResults && (
        <section className="mt-10 space-y-8" data-testid="section-results">
          <AgentProgress stage={state.stage} />

          {state.painPoints.length > 0 && (
            <PipelineSection
              label="Researcher Agent"
              caption="Extracted pain points with severity, frequency, and confidence."
              count={state.painPoints.length}
              testid="section-painpoints"
            >
              <PainPointsPanel items={state.painPoints} />
            </PipelineSection>
          )}

          {state.themes.length > 0 && (
            <PipelineSection
              label="Synthesis Agent"
              caption="Clustered into themes with explicit assumptions to validate."
              count={state.themes.length}
              testid="section-themes"
            >
              <ThemesPanel items={state.themes} />
            </PipelineSection>
          )}

          {state.cards.length > 0 && (
            <div ref={reviewRef}>
              <PipelineSection
                label="Strategy Agent → Human review"
                caption={`${pendingCount} pending · ${acceptedCount} ready for export. Low-confidence cards are flagged in amber.`}
                count={state.cards.length}
                testid="section-cards"
                accent
              >
                <div className="space-y-3">
                  {state.cards
                    .slice()
                    .sort((a, b) => b.priority_score - a.priority_score)
                    .map((c) => (
                      <FeatureCardReview
                        key={c.id}
                        card={c}
                        onAccept={(id) => setCard(id, { status: 'accepted' })}
                        onReject={(id) => setCard(id, { status: 'rejected' })}
                        onEdit={setCard}
                      />
                    ))}
                </div>

                {/* Export */}
                <div className="mt-6 rounded-lg border border-card-border bg-muted/30 p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                  <div className="text-[13px]">
                    <div className="font-medium">Export PRD</div>
                    <div className="text-[12px] text-muted-foreground mt-0.5">
                      {acceptedCount} of {state.cards.length} card{state.cards.length === 1 ? '' : 's'} accepted, sorted by priority.
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={copyMd}
                      disabled={acceptedCount === 0}
                      data-testid="button-copy-md"
                    >
                      <Copy className="w-3.5 h-3.5 mr-1.5" />
                      Copy markdown
                    </Button>
                    <Button
                      size="sm"
                      onClick={downloadMd}
                      disabled={acceptedCount === 0}
                      data-testid="button-download-md"
                    >
                      <Download className="w-3.5 h-3.5 mr-1.5" />
                      Download .md
                    </Button>
                  </div>
                </div>
              </PipelineSection>
            </div>
          )}
        </section>
      )}
    </div>
  );
}

interface PipelineSectionProps {
  label: string;
  caption: string;
  count: number;
  children: React.ReactNode;
  testid?: string;
  accent?: boolean;
}

function PipelineSection({ label, caption, count, children, testid, accent }: PipelineSectionProps) {
  return (
    <section data-testid={testid}>
      <header className="flex items-baseline justify-between mb-3">
        <div>
          <h2 className={`text-[12px] font-semibold uppercase tracking-wider ${accent ? 'text-primary' : 'text-muted-foreground'}`}>
            {label}
          </h2>
          <p className="text-[13.5px] text-muted-foreground mt-1">{caption}</p>
        </div>
        <span className="text-[11.5px] font-mono text-muted-foreground tabular-nums">
          {count} item{count === 1 ? '' : 's'}
        </span>
      </header>
      {children}
    </section>
  );
}
