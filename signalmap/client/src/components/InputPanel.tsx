import { useState } from "react";
import { Eye, EyeOff, KeyRound, Play, Sparkles, AlertTriangle } from "lucide-react";
import type { AgentProgress } from "@/lib/types";

interface InputPanelProps {
  rawInput: string;
  setRawInput: (v: string) => void;
  apiKey: string;
  setApiKey: (v: string) => void;
  rememberKey: boolean;
  setRememberKey: (v: boolean) => void;
  onRun: () => void;
  onSample: () => void;
  onClear: () => void;
  progress: AgentProgress;
  isRunning: boolean;
  apiError: string | null;
}

export function InputPanel(p: InputPanelProps) {
  const [showKey, setShowKey] = useState(false);
  const reviewCount = p.rawInput.split("\n").map((l) => l.trim()).filter(Boolean).length;

  return (
    <div className="glass rounded-2xl p-5 space-y-4" data-testid="input-panel">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold tracking-tight">Paste raw reviews</h2>
          <p className="text-xs text-foreground/60 mt-0.5">
            One per line. Optional date prefix: <span className="font-mono text-foreground/80">YYYY-MM-DD: text</span>
          </p>
        </div>
        <div className="text-xs text-foreground/50 font-mono tabular-nums shrink-0">
          {reviewCount} {reviewCount === 1 ? "line" : "lines"}
        </div>
      </div>

      <textarea
        value={p.rawInput}
        onChange={(e) => p.setRawInput(e.target.value)}
        rows={8}
        spellCheck={false}
        placeholder={"2024-09-12: App crashes every time I open the camera tab.\nLove the new dashboard redesign.\nWhy am I being charged $14.99 when the site says $9.99?"}
        className="w-full bg-background/60 border border-border rounded-xl px-3.5 py-3 text-sm leading-relaxed font-mono text-foreground/90 placeholder:text-foreground/30 focus:outline-none focus:ring-2 focus:ring-emerald-400/40 focus:border-emerald-400/40 resize-y"
        data-testid="textarea-reviews"
      />

      <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-3 items-end">
        <div>
          <label className="text-[11px] uppercase tracking-[0.16em] text-foreground/50 flex items-center gap-1.5 mb-1.5">
            <KeyRound className="w-3.5 h-3.5" />
            <span>Anthropic API key (optional)</span>
          </label>
          <div className="relative">
            <input
              type={showKey ? "text" : "password"}
              value={p.apiKey}
              onChange={(e) => p.setApiKey(e.target.value)}
              placeholder="sk-ant-… leave blank to use sample data"
              className="w-full bg-background/60 border border-border rounded-lg pl-3 pr-10 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-emerald-400/40 focus:border-emerald-400/40"
              autoComplete="off"
              data-testid="input-api-key"
            />
            <button
              type="button"
              onClick={() => setShowKey((s) => !s)}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-md hover-elevate text-foreground/60"
              aria-label={showKey ? "Hide API key" : "Show API key"}
            >
              {showKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
            </button>
          </div>
          <label className="flex items-center gap-2 mt-2 text-[11px] text-foreground/60 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={p.rememberKey}
              onChange={(e) => p.setRememberKey(e.target.checked)}
              className="rounded border-border accent-emerald-400"
              data-testid="checkbox-remember"
            />
            Remember key in this browser. Otherwise stored only in-memory for this session.
          </label>
        </div>

        <div className="flex flex-wrap gap-2 md:justify-end">
          <button
            onClick={p.onSample}
            disabled={p.isRunning}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-emerald-500 text-emerald-950 font-medium text-sm hover:bg-emerald-400 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-[0_0_0_1px_hsl(162_84%_60%/0.4),0_8px_24px_hsl(162_84%_40%/0.3)]"
            data-testid="btn-sample"
          >
            <Sparkles className="w-4 h-4" />
            Try sample (no key)
          </button>
          <button
            onClick={p.onRun}
            disabled={p.isRunning || reviewCount === 0 || !p.apiKey.trim()}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-border text-foreground font-medium text-sm hover-elevate disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            data-testid="btn-run"
          >
            <Play className="w-4 h-4" />
            Run AI pipeline
          </button>
          <button
            onClick={p.onClear}
            disabled={p.isRunning}
            className="px-3 py-2 rounded-lg text-foreground/60 hover:text-foreground text-sm hover-elevate disabled:opacity-50"
            data-testid="btn-clear"
          >
            Clear
          </button>
        </div>
      </div>

      <AgentProgressBar progress={p.progress} isRunning={p.isRunning} />

      {p.apiError && (
        <div className="flex items-start gap-2 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2.5 text-xs text-rose-200" data-testid="api-error">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <div>
            <div className="font-semibold mb-0.5">API call failed</div>
            <div className="text-rose-200/80 leading-relaxed">{p.apiError}</div>
          </div>
        </div>
      )}
    </div>
  );
}

function AgentProgressBar({ progress, isRunning }: { progress: AgentProgress; isRunning: boolean }) {
  if (!isRunning && progress.parse === "idle") return null;
  return (
    <div className="grid grid-cols-3 gap-2" data-testid="agent-progress">
      <AgentStep n={1} label="Parser" state={progress.parse} error={progress.parseError} />
      <AgentStep n={2} label="Semantic tagger" state={progress.tag} error={progress.tagError} />
      <AgentStep n={3} label="Synthesizer" state={progress.synth} error={progress.synthError} />
    </div>
  );
}

function AgentStep({ n, label, state, error }: { n: number; label: string; state: "idle" | "running" | "done" | "error"; error?: string }) {
  const map = {
    idle: { ring: "border-border/60", text: "text-foreground/40", bar: "bg-border/40" },
    running: { ring: "border-emerald-400/60", text: "text-emerald-300", bar: "progress-stripes bg-emerald-500/20" },
    done: { ring: "border-emerald-400/80", text: "text-emerald-300", bar: "bg-emerald-500/70" },
    error: { ring: "border-rose-400/80", text: "text-rose-300", bar: "bg-rose-500/60" },
  } as const;
  const m = map[state];
  return (
    <div className={`rounded-lg border ${m.ring} bg-background/40 px-3 py-2`}>
      <div className="flex items-center gap-2">
        <span className={`grid place-items-center w-5 h-5 rounded-full text-[10px] font-mono border ${m.ring} ${m.text}`}>
          {n}
        </span>
        <div className="text-xs">
          <div className={`font-medium ${m.text}`}>{label}</div>
          <div className="text-[10px] uppercase tracking-[0.16em] text-foreground/40">
            {state === "idle" ? "waiting" : state === "running" ? "running…" : state === "done" ? "done" : "error"}
          </div>
        </div>
      </div>
      <div className="mt-2 h-1 rounded-full overflow-hidden bg-background/60">
        <div className={`h-full transition-all duration-300 ${m.bar}`} style={{ width: state === "idle" ? "0%" : state === "done" ? "100%" : state === "error" ? "100%" : "75%" }} />
      </div>
      {error && <div className="text-[10px] text-rose-300 mt-1 line-clamp-1">{error}</div>}
    </div>
  );
}
