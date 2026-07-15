import { ShieldCheck, Server, KeyRound, Eye, Trash2 } from 'lucide-react';

export function Privacy() {
  return (
    <article className="max-w-[760px] mx-auto px-6 py-12 sm:py-16" data-testid="page-privacy">
      <header className="mb-10">
        <div className="text-[12px] font-mono text-muted-foreground tracking-wider uppercase mb-2">
          Policy · v1.0 · Public
        </div>
        <h1 className="font-display text-[40px] sm:text-[48px] leading-[1.05] tracking-tight">
          Data Privacy
        </h1>
        <p className="mt-3 text-[15.5px] text-muted-foreground leading-relaxed max-w-[60ch]">
          User research is sensitive. This page documents exactly what data
          InsightDraft sees, what gets stripped, and where it goes.
        </p>
      </header>

      <Section icon={<Server className="w-4 h-4" />} title="There is no backend">
        <p>
          InsightDraft is a static frontend. We do not run a server that
          receives your research. Your text goes directly from your browser to
          Anthropic over HTTPS, using <em>your</em> API key.
        </p>
        <p>
          The practical implications:
        </p>
        <ul>
          <li>No InsightDraft-controlled server logs your input.</li>
          <li>No analytics on the contents of your research.</li>
          <li>Anthropic's data-handling policy applies to the redacted text we send. By default Anthropic does not train on API customer data — see <a href="https://www.anthropic.com/legal/commercial-terms" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">their commercial terms</a>.</li>
        </ul>
      </Section>

      <Section icon={<ShieldCheck className="w-4 h-4" />} title="PII stripping policy">
        <p>
          Before <em>any</em> network call to Anthropic, your input is run
          through a redaction pass in this browser tab. We replace the
          following with explicit placeholders:
        </p>
        <ul>
          <li><code>[EMAIL]</code> — Any string matching standard email syntax (e.g. user@example.com).</li>
          <li><code>[PHONE]</code> — Numeric sequences that match common US and international phone formats (10+ digits).</li>
          <li><code>[URL]</code> — Any URL starting with <code>http://</code>, <code>https://</code>, or <code>www.</code>.</li>
          <li><code>[PERSON]</code> — A conservative list of common given names. We over-redact rather than under-redact.</li>
          <li><code>[SSN]</code> — US social security number pattern (XXX-XX-XXXX).</li>
          <li><code>[CARD]</code> — Credit-card-shaped digit sequences (13–19 digits).</li>
        </ul>
        <p>
          Conservative on purpose: it is much cheaper to redact a non-PII word
          than to leak one real one. We show the redaction count in the input
          panel before you run the pipeline so you can audit it.
        </p>
        <p className="text-[13px] text-muted-foreground italic">
          Limitations we are honest about: a regex-based PII pass will miss
          unusual names, transliterated names, and free-form addresses. For
          regulated data (PHI, financial account numbers beyond credit cards,
          government IDs), do your own redaction pass before pasting.
        </p>
      </Section>

      <Section icon={<KeyRound className="w-4 h-4" />} title="Your API key">
        <p>
          Your Anthropic API key is stored only in this browser, either in{' '}
          <code>localStorage</code> (when available) or an in-memory fallback
          (sandboxed iframes, Safari private mode). We never read it, transmit
          it anywhere except to api.anthropic.com, or include it in build
          artifacts.
        </p>
        <p>
          You can clear it at any time from Settings → Clear. Closing the tab
          in fallback mode also drops it.
        </p>
      </Section>

      <Section icon={<Eye className="w-4 h-4" />} title="What persists locally">
        <p>
          The Studio writes the following to your browser's local storage so
          you can come back to a run in progress:
        </p>
        <ul>
          <li>The raw input you pasted.</li>
          <li>The agent outputs (pain points, themes, PRD cards).</li>
          <li>Your accept/reject/edit decisions.</li>
          <li>The current pipeline stage.</li>
        </ul>
        <p>
          Nothing here ever leaves your device except the redacted research
          sent to Anthropic during a live run.
        </p>
      </Section>

      <Section icon={<Trash2 className="w-4 h-4" />} title="Deleting your data">
        <p>
          Click <strong>Reset</strong> in the Studio to clear the current run.
          To wipe everything, clear site data for this origin in your browser
          (Chrome: Settings → Privacy → Cookies and site data → See all site data).
        </p>
      </Section>

      <footer className="mt-12 pt-6 border-t border-border text-[12.5px] text-muted-foreground">
        Questions about this policy belong on the PR that introduced it. This
        is a portfolio project — for production deployment a formal DPA and
        SOC 2 mapping would be added.
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
                      prose-headings:text-foreground
                      prose-p:my-3
                      prose-ul:my-3 prose-li:my-1
                      prose-strong:text-foreground prose-strong:font-semibold
                      prose-code:text-primary prose-code:bg-primary/8 prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:text-[12.5px] prose-code:font-mono prose-code:before:content-none prose-code:after:content-none
                      prose-a:text-primary
                      prose-em:text-foreground/90">
        {children}
      </div>
    </section>
  );
}
