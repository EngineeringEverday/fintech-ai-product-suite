import { useEffect, useMemo, useState } from "react";
import { Download, FileSpreadsheet, Github, ExternalLink } from "lucide-react";
import { Logo } from "@/components/Logo";
import { InputPanel } from "@/components/InputPanel";
import { BubbleGrid } from "@/components/BubbleGrid";
import { SummaryPanel } from "@/components/SummaryPanel";
import { SentimentTimeline } from "@/components/SentimentTimeline";
import { ClusterList } from "@/components/ClusterList";
import { ClusterDrawer } from "@/components/ClusterDrawer";
import { HowItWorks } from "@/components/HowItWorks";
import type {
  AgentProgress,
  ClusterStatus,
  ClusterSynthesis,
  ParsedReview,
  TaggedReview,
  ThemeCluster,
} from "@/lib/types";
import { storage, STORAGE_KEYS } from "@/lib/storage";
import {
  SAMPLE_RAW_INPUT,
  SAMPLE_PARSED,
  SAMPLE_TAGGED,
  SAMPLE_SYNTHESIS,
} from "@/lib/sampleData";
import { runParser, runTagger, runSynth, ClaudeError } from "@/lib/claude";
import { exportTaggedCSV } from "@/lib/csv";

type Tab = "dashboard" | "how";

export default function Home() {
  const [tab, setTab] = useState<Tab>("dashboard");
  const [rawInput, setRawInput] = useState<string>(() =>
    storage.get<string>(STORAGE_KEYS.rawInput, "") ?? ""
  );
  const [parsed, setParsed] = useState<ParsedReview[]>(() =>
    storage.get<ParsedReview[]>(STORAGE_KEYS.parsed, []) ?? []
  );
  const [tagged, setTagged] = useState<TaggedReview[]>(() =>
    storage.get<TaggedReview[]>(STORAGE_KEYS.tagged, []) ?? []
  );
  const [synthesis, setSynthesis] = useState<ClusterSynthesis[]>(() =>
    storage.get<ClusterSynthesis[]>(STORAGE_KEYS.synthesis, []) ?? []
  );
  const [statuses, setStatuses] = useState<Record<string, ClusterStatus>>(() =>
    storage.get<Record<string, ClusterStatus>>(STORAGE_KEYS.statuses, {}) ?? {}
  );
  const [rememberKey, setRememberKey] = useState<boolean>(() =>
    storage.get<boolean>(STORAGE_KEYS.rememberKey, false) ?? false
  );
  const [apiKey, setApiKey] = useState<string>(() => {
    if (storage.get<boolean>(STORAGE_KEYS.rememberKey, false)) {
      return storage.get<string>(STORAGE_KEYS.apiKey, "") ?? "";
    }
    return "";
  });

  const [progress, setProgress] = useState<AgentProgress>({ parse: "idle", tag: "idle", synth: "idle" });
  const [isRunning, setIsRunning] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);
  const [openCluster, setOpenCluster] = useState<ThemeCluster | null>(null);

  // Persist state changes
  useEffect(() => storage.set(STORAGE_KEYS.rawInput, rawInput), [rawInput]);
  useEffect(() => storage.set(STORAGE_KEYS.parsed, parsed), [parsed]);
  useEffect(() => storage.set(STORAGE_KEYS.tagged, tagged), [tagged]);
  useEffect(() => storage.set(STORAGE_KEYS.synthesis, synthesis), [synthesis]);
  useEffect(() => storage.set(STORAGE_KEYS.statuses, statuses), [statuses]);
  useEffect(() => {
    storage.set(STORAGE_KEYS.rememberKey, rememberKey);
    if (rememberKey) storage.set(STORAGE_KEYS.apiKey, apiKey);
    else storage.remove(STORAGE_KEYS.apiKey);
  }, [rememberKey, apiKey]);

  const hasResults = synthesis.length > 0 && tagged.length > 0;

  const synthesisByCluster = useMemo(() => {
    const m = new Map<ThemeCluster, ClusterSynthesis>();
    synthesis.forEach((s) => m.set(s.cluster_name, s));
    return m;
  }, [synthesis]);

  function handleSetStatus(cluster: string, s: ClusterStatus) {
    setStatuses((prev) => ({ ...prev, [cluster]: s }));
  }

  async function handleSample() {
    setApiError(null);
    setIsRunning(true);
    setProgress({ parse: "running", tag: "idle", synth: "idle" });
    setRawInput(SAMPLE_RAW_INPUT);
    setParsed([]);
    setTagged([]);
    setSynthesis([]);

    // Simulate the 3 agents completing in sequence with visible progress.
    await sleep(450);
    setParsed(SAMPLE_PARSED);
    setProgress((p) => ({ ...p, parse: "done", tag: "running" }));
    await sleep(700);
    setTagged(SAMPLE_TAGGED);
    setProgress((p) => ({ ...p, tag: "done", synth: "running" }));
    await sleep(650);
    setSynthesis(SAMPLE_SYNTHESIS);
    setProgress((p) => ({ ...p, synth: "done" }));
    setIsRunning(false);
  }

  async function handleRun() {
    if (!apiKey.trim()) return;
    setApiError(null);
    setIsRunning(true);
    setProgress({ parse: "running", tag: "idle", synth: "idle" });
    setParsed([]);
    setTagged([]);
    setSynthesis([]);

    try {
      const p = await runParser(apiKey.trim(), rawInput);
      setParsed(p);
      setProgress((s) => ({ ...s, parse: "done", tag: "running" }));

      const t = await runTagger(apiKey.trim(), p);
      setTagged(t);
      setProgress((s) => ({ ...s, tag: "done", synth: "running" }));

      const syn = await runSynth(apiKey.trim(), t);
      setSynthesis(syn.sort((a, b) => b.priority_score - a.priority_score));
      setProgress((s) => ({ ...s, synth: "done" }));
    } catch (e) {
      const ce = e instanceof ClaudeError ? e : null;
      const msg = ce
        ? ce.message
        : e instanceof Error
        ? e.message
        : "Unknown error.";
      setApiError(msg);
      setProgress((s) => {
        if (s.synth === "running") return { ...s, synth: "error", synthError: msg };
        if (s.tag === "running") return { ...s, tag: "error", tagError: msg };
        return { ...s, parse: "error", parseError: msg };
      });
    } finally {
      setIsRunning(false);
    }
  }

  function handleClear() {
    setRawInput("");
    setParsed([]);
    setTagged([]);
    setSynthesis([]);
    setStatuses({});
    setProgress({ parse: "idle", tag: "idle", synth: "idle" });
    setApiError(null);
  }

  function handleExport() {
    if (parsed.length === 0 || tagged.length === 0) return;
    exportTaggedCSV(parsed, tagged);
  }

  return (
    <div className="min-h-screen relative">
      <div className="absolute inset-0 bg-grid opacity-30 pointer-events-none" aria-hidden />

      <header className="relative z-10 border-b border-border/70 backdrop-blur-md bg-background/50 sticky top-0">
        <div className="max-w-[1400px] mx-auto px-4 sm:px-6 py-3 flex items-center gap-4">
          <Logo />
          <span className="hidden sm:inline text-[11px] text-foreground/40 font-mono uppercase tracking-[0.18em]">
            Product Intelligence
          </span>
          <nav className="ml-auto flex items-center gap-1" data-testid="tabs">
            <TabBtn active={tab === "dashboard"} onClick={() => setTab("dashboard")} testId="tab-dashboard">
              Dashboard
            </TabBtn>
            <TabBtn active={tab === "how"} onClick={() => setTab("how")} testId="tab-how">
              How it works
            </TabBtn>
          </nav>
        </div>
      </header>

      <main className="relative z-10 max-w-[1400px] mx-auto px-4 sm:px-6 py-6 space-y-6 pb-24">
        {tab === "dashboard" ? (
          <>
            {/* Hero */}
            <section className="space-y-1.5">
              <div className="text-[11px] uppercase tracking-[0.18em] text-emerald-300/80">
                SignalMap
              </div>
              <h1 className="text-balance text-3xl sm:text-4xl font-semibold tracking-tight">
                See what your customers actually mean.
              </h1>
              <p className="text-foreground/70 max-w-2xl text-pretty leading-relaxed">
                Paste raw reviews — Claude parses, tags, and synthesizes them
                into semantic clusters with a sentiment timeline. No keywords.
                No backend. Try the sample to see it in under 60 seconds.
              </p>
            </section>

            <InputPanel
              rawInput={rawInput}
              setRawInput={setRawInput}
              apiKey={apiKey}
              setApiKey={setApiKey}
              rememberKey={rememberKey}
              setRememberKey={setRememberKey}
              onRun={handleRun}
              onSample={handleSample}
              onClear={handleClear}
              progress={progress}
              isRunning={isRunning}
              apiError={apiError}
            />

            {hasResults && (
              <>
                <SummaryPanel tagged={tagged} synthesis={synthesis} />

                {/* Bubble grid hero */}
                <section className="glass rounded-2xl p-5 sm:p-8" data-testid="section-bubbles">
                  <div className="flex items-end justify-between flex-wrap gap-2 mb-3">
                    <div>
                      <div className="text-[11px] uppercase tracking-[0.18em] text-foreground/50">
                        Theme clusters
                      </div>
                      <h3 className="text-xl font-semibold tracking-tight">
                        Bubble size = volume · color = sentiment
                      </h3>
                    </div>
                    <div className="text-xs text-foreground/50">
                      Click any bubble to inspect its reviews.
                    </div>
                  </div>
                  <BubbleGrid
                    clusters={synthesis}
                    statuses={statuses}
                    onSelect={(c) => setOpenCluster(c)}
                  />
                </section>

                {/* Timeline */}
                <section className="glass rounded-2xl p-5 sm:p-6" data-testid="section-timeline">
                  <div className="flex items-end justify-between flex-wrap gap-2 mb-3">
                    <div>
                      <div className="text-[11px] uppercase tracking-[0.18em] text-foreground/50">
                        Sentiment timeline
                      </div>
                      <h3 className="text-xl font-semibold tracking-tight">
                        How sentiment moves over time, per cluster
                      </h3>
                    </div>
                    <button
                      onClick={handleExport}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-xs text-foreground/80 hover-elevate"
                      data-testid="btn-export-csv"
                    >
                      <FileSpreadsheet className="w-3.5 h-3.5" />
                      Export tagged CSV
                    </button>
                  </div>
                  <SentimentTimeline parsed={parsed} tagged={tagged} />
                </section>

                {/* Cluster cards */}
                <section className="space-y-3" data-testid="section-clusters">
                  <div>
                    <div className="text-[11px] uppercase tracking-[0.18em] text-foreground/50">
                      Cluster briefs
                    </div>
                    <h3 className="text-xl font-semibold tracking-tight">
                      Recommended PM actions, ranked by priority
                    </h3>
                  </div>
                  <ClusterList
                    synthesis={synthesis}
                    statuses={statuses}
                    onSetStatus={handleSetStatus}
                    onOpenCluster={(c) => setOpenCluster(c as ThemeCluster)}
                  />
                </section>
              </>
            )}

            {!hasResults && !isRunning && (
              <EmptyState onSample={handleSample} />
            )}
          </>
        ) : (
          <HowItWorks />
        )}
      </main>

      <footer className="relative z-10 border-t border-border/70 mt-12">
        <div className="max-w-[1400px] mx-auto px-4 sm:px-6 py-5 flex flex-wrap items-center justify-between gap-3 text-xs text-foreground/50">
          <div className="flex items-center gap-3">
            <Logo size={20} />
            <span>· Three Claude agents · Recharts · Tailwind · No backend</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="font-mono">claude-sonnet-4-20250514</span>
          </div>
        </div>
      </footer>

      <ClusterDrawer
        cluster={openCluster}
        parsed={parsed}
        tagged={tagged}
        synthesis={openCluster ? synthesisByCluster.get(openCluster) ?? null : null}
        onClose={() => setOpenCluster(null)}
      />
    </div>
  );
}

function TabBtn({ active, onClick, children, testId }: { active: boolean; onClick: () => void; children: React.ReactNode; testId: string }) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors hover-elevate ${
        active ? "bg-emerald-500/15 text-emerald-200 border border-emerald-500/30" : "text-foreground/70"
      }`}
      data-testid={testId}
    >
      {children}
    </button>
  );
}

function EmptyState({ onSample }: { onSample: () => void }) {
  return (
    <div className="glass rounded-2xl p-10 text-center" data-testid="empty-state">
      <div className="mx-auto w-12 h-12 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 grid place-items-center text-emerald-300 mb-4">
        <Download className="w-5 h-5" />
      </div>
      <h3 className="text-lg font-semibold mb-1">Drop in reviews to begin</h3>
      <p className="text-sm text-foreground/60 max-w-md mx-auto mb-4">
        Paste raw text above and add your Anthropic API key — or skip the key entirely and demo the full visualization with 50 sample reviews.
      </p>
      <button
        onClick={onSample}
        className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-500 text-emerald-950 font-medium text-sm hover:bg-emerald-400 transition-colors"
        data-testid="btn-empty-sample"
      >
        Load 50 sample reviews
        <ExternalLink className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

function sleep(ms: number) {
  return new Promise<void>((res) => setTimeout(res, ms));
}
