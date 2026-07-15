import { Brain, Layers, GitBranch, ShieldAlert } from "lucide-react";

export function HowItWorks() {
  return (
    <div className="space-y-6 max-w-4xl" data-testid="how-it-works">
      <header className="space-y-2">
        <div className="text-[11px] uppercase tracking-[0.18em] text-emerald-300/80">
          How SignalMap works
        </div>
        <h2 className="text-2xl font-semibold tracking-tight">
          Three agents turn raw reviews into product strategy.
        </h2>
        <p className="text-foreground/70 leading-relaxed max-w-2xl">
          SignalMap chains three Claude agents over your raw review text. Each
          stage runs against the structured output of the previous one — no
          keyword matching, no manual tagging.
        </p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Step
          icon={<Brain className="w-4 h-4" />}
          n={1}
          title="Parser agent"
          desc="Splits raw text into clean JSON records, extracting an optional date prefix so timelines line up correctly."
        />
        <Step
          icon={<Layers className="w-4 h-4" />}
          n={2}
          title="Semantic tagger"
          desc="Assigns sentiment, a numeric -1 to +1 score, intensity, a one-line core insight, and one of seven theme clusters."
        />
        <Step
          icon={<GitBranch className="w-4 h-4" />}
          n={3}
          title="Synthesis agent"
          desc="Rolls clusters up into PM-grade briefs: top complaints, top praises, trend direction, priority score, and a recommended action."
        />
      </div>

      <section className="glass rounded-2xl p-5 space-y-3">
        <h3 className="font-semibold">Semantic clustering vs. keyword search</h3>
        <p className="text-sm text-foreground/75 leading-relaxed">
          Keyword search groups reviews by surface words. It misses
          "$30 is too much," "cancelled my subscription," and "find another
          customer" as a single Pricing signal. Semantic clustering uses the
          model's understanding of meaning — sarcasm, idiom, and product context
          included — to land each review in the cluster where a senior PM would
          file it.
        </p>
        <ul className="text-sm text-foreground/70 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5 list-disc list-inside">
          <li>"App eats 12% of my battery" → <span className="text-emerald-300">Performance</span></li>
          <li>"Doubled the family plan with no notice" → <span className="text-emerald-300">Pricing</span></li>
          <li>"Support told me to clear my cache" → <span className="text-emerald-300">Support</span></li>
          <li>"Crashed during a client demo" → <span className="text-emerald-300">Reliability</span></li>
        </ul>
      </section>

      <section className="glass rounded-2xl p-5 space-y-3 border-l-2 border-amber-400/40">
        <h3 className="font-semibold flex items-center gap-2">
          <ShieldAlert className="w-4 h-4 text-amber-300" />
          Honest limitations
        </h3>
        <ul className="text-sm text-foreground/75 leading-relaxed list-disc list-inside space-y-1">
          <li>LLMs make mistakes. Always validate edge cases before shipping decisions, especially for Pricing and Support routing.</li>
          <li>Sarcasm and bilingual reviews can shift sentiment by ±0.3. Treat scores as directional, not authoritative.</li>
          <li>The seven theme clusters are opinionated. Adapt the tagger prompt to your domain (B2B, hardware, fintech) for higher fidelity.</li>
          <li>Browser-direct calls to Anthropic require the dangerous-browser-access header. For production, route through a server proxy you control.</li>
          <li>Don't compare absolute priority scores across products — they're relative within a single batch.</li>
        </ul>
      </section>
    </div>
  );
}

function Step({ n, icon, title, desc }: { n: number; icon: React.ReactNode; title: string; desc: string }) {
  return (
    <div className="glass rounded-2xl p-5">
      <div className="flex items-center gap-2 mb-2">
        <span className="grid place-items-center w-6 h-6 rounded-md bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
          {icon}
        </span>
        <span className="text-[10px] font-mono uppercase tracking-[0.18em] text-foreground/50">
          Agent {n}
        </span>
      </div>
      <h4 className="font-semibold mb-1.5">{title}</h4>
      <p className="text-sm text-foreground/70 leading-relaxed">{desc}</p>
    </div>
  );
}
