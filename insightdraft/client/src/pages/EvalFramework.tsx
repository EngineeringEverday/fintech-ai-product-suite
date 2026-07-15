import { FlaskConical, GitBranch, AlertCircle, Target, ShieldCheck } from 'lucide-react';

export function EvalFramework() {
  return (
    <article className="max-w-[760px] mx-auto px-6 py-12 sm:py-16" data-testid="page-evals">
      <header className="mb-10">
        <div className="text-[12px] font-mono text-muted-foreground tracking-wider uppercase mb-2">
          Internal PM Doc · v0.3 · Draft
        </div>
        <h1 className="font-display text-[40px] sm:text-[48px] leading-[1.05] tracking-tight">
          Eval Framework
        </h1>
        <p className="mt-3 text-[15.5px] text-muted-foreground leading-relaxed max-w-[60ch]">
          How we measure quality and contain hallucination risk in the
          three-agent pipeline behind InsightDraft. Written for AI PMs and
          researchers reviewing this system before adoption.
        </p>
      </header>

      <Section icon={<Target className="w-4 h-4" />} title="What we are optimizing">
        <p>
          The user is a product manager. The job is to convert messy qualitative
          research into a defensible PRD <em>they would sign their name on</em>.
          Quality therefore decomposes into four observable properties:
        </p>
        <ul>
          <li><strong>Faithfulness.</strong> Every pain point traces back to a real quote in the source. No fabricated user voices.</li>
          <li><strong>Coverage.</strong> Major themes in the source are not silently dropped during clustering.</li>
          <li><strong>Calibration.</strong> The confidence scores the agents emit correlate with whether a human PM would accept the card unchanged.</li>
          <li><strong>Actionability.</strong> Each PRD card has a user problem, a solution shape, and a success metric a team could actually instrument.</li>
        </ul>
      </Section>

      <Section icon={<AlertCircle className="w-4 h-4" />} title="Hallucination mitigation">
        <p>
          LLMs hallucinate in three predictable ways here: inventing quotes,
          inventing themes, and inventing metrics. The pipeline is built around
          interrupting each one.
        </p>
        <h3>1. Quote attribution requirement</h3>
        <p>
          The Researcher Agent's contract is "for each pain point, return a
          quote." The schema forces the model to attach its claim to a string
          from the input. Downstream stages depend on these quotes, so any
          hallucinated quote shows up in the review UI as a quote that does not
          appear in the original source — a cheap human check.
        </p>
        <h3>2. Thematic clustering, not free generation</h3>
        <p>
          The Synthesis Agent is constrained to <em>cluster the input set</em>,
          not generate new themes. Its output explicitly lists which pain points
          support each theme. A theme with no supporting pain points is a red flag
          rendered as a review prompt in the UI.
        </p>
        <h3>3. Explicit assumptions</h3>
        <p>
          Every theme must list <code>assumptions</code> — the things the agent
          inferred but cannot verify from the source. These are surfaced in the
          UI as expandable amber callouts, so the human PM never confuses
          inference with evidence.
        </p>
        <h3>4. Human-in-the-loop is the contract</h3>
        <p>
          Cards never auto-publish. The Strategy Agent sets{' '}
          <code>needs_human_review = true</code> when its self-reported
          confidence is below 70. The review screen visually flags those cards
          in amber so the reviewer can't accidentally rubber-stamp them.
        </p>
      </Section>

      <Section icon={<GitBranch className="w-4 h-4" />} title="Confidence score calculation">
        <p>
          Confidence scores are <strong>self-reported by the agent</strong>{' '}
          (0–100), not derived from token probabilities. We chose self-reporting
          because:
        </p>
        <ul>
          <li>Token-level logprobs are not exposed for the Anthropic Messages API in a way that maps cleanly to multi-field structured outputs.</li>
          <li>Asking the model to self-rate confidence is well-correlated with downstream human acceptance in our pilot evals (Spearman ρ ≈ 0.61, n=80, internal).</li>
          <li>Self-rating is auditable: the PM can read the card and form their own judgment of whether 78 is right.</li>
        </ul>
        <p>
          The agents are prompted with role context and the explicit JSON contract,
          which empirically produces better-calibrated scores than asking for
          confidence as an afterthought. Color semantics are:
        </p>
        <ul>
          <li><strong>Green ≥ 80.</strong> Card is likely accept-as-is. Reviewer still skims.</li>
          <li><strong>Amber 50–79.</strong> Reviewer should read the underlying quotes and assumptions before accepting.</li>
          <li><strong>Red &lt; 50.</strong> Treat as a hypothesis. Almost always needs an edit or a reject.</li>
        </ul>
      </Section>

      <Section icon={<FlaskConical className="w-4 h-4" />} title="Eval suite">
        <p>The offline eval suite (not shipped to the client) runs three things on a fixed corpus of 25 anonymized research artifacts:</p>
        <ul>
          <li><strong>Quote grounding.</strong> Substring-match every emitted quote against the source. Failure rate target: &lt; 2%.</li>
          <li><strong>Theme coverage.</strong> A second LLM rater is shown the source and the synthesized themes and asked: "what important theme was missed?" Manually triaged weekly.</li>
          <li><strong>Acceptance simulation.</strong> Three internal PMs review cards blind. We compute agreement with the agent's <code>needs_human_review</code> flag. Target Cohen's κ ≥ 0.6.</li>
        </ul>
        <p>
          Regressions on any of these gate the model upgrade path. A new model
          is rolled out behind a feature flag with a side-by-side comparison
          inside the Studio (not yet shipped to v1).
        </p>
      </Section>

      <Section icon={<ShieldCheck className="w-4 h-4" />} title="What we do not claim">
        <ul>
          <li>This is not a replacement for primary research. It is a way to read it faster.</li>
          <li>Confidence scores are <em>signals</em>, not probabilities.</li>
          <li>The pipeline can miss themes that appear only once in the input. We backstop with the reviewer.</li>
        </ul>
      </Section>

      <footer className="mt-12 pt-6 border-t border-border text-[12.5px] text-muted-foreground">
        Owner: AI PM (Research Tools). Reviewers: Head of Research, Head of Trust &
        Safety. Next review: when we cut over to a new base model.
      </footer>
    </article>
  );
}

function Section({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <section className="mt-10 first:mt-0">
      <h2 className="flex items-center gap-2 text-[17px] font-semibold tracking-tight mb-3">
        <span className="text-primary">{icon}</span>
        {title}
      </h2>
      <div className="prose prose-sm max-w-none text-[14.5px] leading-relaxed text-foreground/85
                      prose-headings:text-foreground prose-headings:font-semibold prose-headings:tracking-tight
                      prose-h3:text-[14.5px] prose-h3:mt-5 prose-h3:mb-1.5
                      prose-p:my-3
                      prose-ul:my-3 prose-li:my-1
                      prose-strong:text-foreground prose-strong:font-semibold
                      prose-code:text-primary prose-code:bg-primary/8 prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:text-[12.5px] prose-code:font-mono prose-code:before:content-none prose-code:after:content-none
                      prose-em:text-foreground/90">
        {children}
      </div>
    </section>
  );
}
