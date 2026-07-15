# InsightDraft

**A chain-of-agents PRD studio.** Paste raw user research, watch three Claude agents (Researcher → Synthesis → Strategy) turn it into a structured, reviewable PRD — with confidence scores, surfaced assumptions, and a human-in-the-loop review gate before anything ships.

Built as a portfolio piece for senior AI product management work: opinionated on agent design, hallucination containment, calibrated confidence, and the UX of human review.

---

## Live demo

The app is a static SPA (`dist/public`) — drop it on any static host (Vercel, Netlify, GitHub Pages, S3+CloudFront). No backend, no environment variables on the server.

Two ways to experience the pipeline:

- **Demo Mode** — runs the full three-agent flow on hand-crafted realistic outputs in ~3 seconds, no API key required. Designed so a reviewer can walk the entire product loop in under 60 seconds.
- **Live Mode** — bring your own Anthropic API key (entered in the Settings dialog, stored locally in `localStorage`, never transmitted anywhere except `api.anthropic.com`). See the [CORS caveat](#frontend-only-anthropic-integration--cors-caveat) below.

---

## Product flow

```
1. Paste research      ─►  2. PII strip + agents     ─►  3. Human review      ─►  4. Export
   (raw transcripts,        Researcher → Synthesis        Accept / reject /        Markdown PRD,
    interview notes,        → Strategy, with progress     edit each card,          copy or download
    survey free-text)       indicator                     low-confidence flagged
```

The product is structured around the moment a PM has to **defend** the PRD they wrote. Every output is auditable: pain points carry the source quote, themes list their assumptions, cards expose self-reported confidence, and anything below threshold is visually flagged for review before it can be exported.

---

## Key features

- **Three-agent chain-of-thought pipeline** with strict JSON contracts at each handoff and defensive parsing on the client.
- **Calibrated confidence scoring** (0–100) per pain point, theme, and feature card, with green / amber / red semantics tied to PM acceptance behavior.
- **Automatic "needs human review" flag** on any card under 70 confidence, re-applied defensively client-side even if the model omits it.
- **Client-side PII redaction** (`[EMAIL]`, `[PHONE]`, `[URL]`, `[PERSON]`, `[SSN]`, `[CARD]`) **before any network call**, with a visible redaction count in the input panel.
- **Demo Mode** — full pipeline in ~3 seconds with reveal animations, zero API cost, zero key required.
- **Reviewer UX** — expandable assumptions, source-quote pinning, accept / reject / edit per card, Markdown export (copy or download).
- **Internal eval framework page** (`/#/evals`) — written as a real internal PM doc covering faithfulness, coverage, calibration, and the offline eval suite.
- **Privacy page** (`/#/privacy`) documenting the data policy.
- **Resilient persistence** — `safeStorage` wrapper falls back to in-memory storage when `localStorage` is blocked (sandboxed iframes, Safari private mode), so the app never hard-crashes.

---

## AI agent pipeline

Three system prompts, one per agent, kept verbatim in `client/src/lib/prompts.ts`. The pipeline orchestrator is `client/src/lib/pipeline.ts`.

### 1. Researcher Agent
> Reads raw research and extracts atomic pain points.

**Output contract**

```json
{
  "quote": "string — verbatim from source",
  "pain_point": "string",
  "severity": "High | Med | Low",
  "frequency_estimate": "string",
  "confidence_score": 0-100
}
```

The `quote` field is the **anti-hallucination anchor**: every pain point must trace back to a string in the input. Fabricated quotes show up immediately to a human reviewer.

### 2. Synthesis Agent
> Clusters pain points into 3–6 themes. **Cluster, don't generate.**

**Output contract**

```json
{
  "theme_name": "string",
  "summary": "string",
  "supporting_pain_points": ["pp-id-or-text", "..."],
  "assumptions": ["explicitly-listed inference, ..."],
  "confidence_score": 0-100
}
```

Themes must list which pain points support them and which inferences are unverified. A theme with no support is a red flag visible in the UI.

### 3. Strategy Agent
> Drafts PRD-style feature cards with a success metric.

**Output contract**

```json
{
  "feature_name": "string",
  "user_problem": "string",
  "proposed_solution": "string",
  "success_metric": "string — instrumentable",
  "priority_score": 1-10,
  "confidence_score": 0-100,
  "needs_human_review": boolean
}
```

Cards with `confidence_score < 70` are flagged `needs_human_review = true`. The flag is re-applied defensively in `normalizeCards()` even when the model forgets.

Model: `claude-sonnet-4-20250514` via the Anthropic Messages API.

---

## Hallucination & quality controls

Four interlocking guards, documented in detail on the in-app `/#/evals` page:

1. **Quote attribution requirement.** The Researcher's schema forces every pain point to carry a verbatim quote — the cheapest possible human grounding check.
2. **Cluster, don't generate.** The Synthesis Agent is constrained to organize the existing pain-point set, not invent new themes.
3. **Explicit assumptions.** Every theme must enumerate inferences it cannot verify from source. Surfaced in the UI as amber callouts so reviewers never confuse inference with evidence.
4. **Human-in-the-loop is the contract.** Cards never auto-publish. Below-threshold confidence flips the review flag and renders the card in amber. The reviewer must accept, reject, or edit before export.

**Confidence semantics**

| Range  | Color | Treatment                                         |
|--------|-------|---------------------------------------------------|
| ≥ 80   | Green | Likely accept-as-is; reviewer skims                |
| 50–79  | Amber | Read quotes + assumptions before accepting         |
| < 50   | Red   | Treat as hypothesis; almost always needs edit/reject|

Confidence is **self-reported by the agent**, not derived from logprobs. The Eval Framework page documents the rationale (logprobs aren't cleanly exposed for multi-field structured outputs, and self-reports correlated with downstream human acceptance at Spearman ρ ≈ 0.61 in our pilot).

**Defensive client-side normalization** (`client/src/lib/pipeline.ts`)

- Scores clamped to valid ranges (`clampScore`).
- Severity normalized to `High | Med | Low` regardless of model variation.
- Malformed JSON tolerated — `anthropic.ts` strips code fences and slices the outermost `[ ... ]` when needed.
- Empty agent outputs surface a polished, actionable error instead of crashing the pipeline.

---

## Privacy & PII handling

All PII redaction is **client-side and happens before any byte hits the network.** Implementation in `client/src/lib/pii.ts`. Categories redacted:

- `[EMAIL]` · `[PHONE]` · `[URL]` · `[PERSON]` · `[SSN]` · `[CARD]`

A live count is rendered in the input panel (`N PII redacted`). The full policy lives at `/#/privacy`.

**Data residency**

- The Anthropic API key is stored in `localStorage` only (`insightdraft.apiKey.v1`).
- Run state (input, agent outputs, review decisions) is stored in `localStorage` only (`insightdraft.run.v1`).
- Nothing is sent to a server owned by this project — there is no server.
- Anthropic API calls go directly from the browser to `api.anthropic.com`.

---

## Architecture & tech stack

| Layer            | Choice                                                                 |
|------------------|------------------------------------------------------------------------|
| Frontend         | React 18 + Vite + TypeScript                                           |
| Styling          | Tailwind CSS v3 + shadcn/ui (Radix primitives)                         |
| Routing          | `wouter` with hash routing (`/#/`, `/#/evals`, `/#/privacy`)           |
| Motion           | `framer-motion` for agent reveal animations                            |
| LLM              | Anthropic Messages API, `claude-sonnet-4-20250514`                     |
| Backend          | **None.** Static SPA — deployable anywhere                             |
| Persistence      | `safeStorage` wrapper over `localStorage`, in-memory fallback          |
| Build            | `tsx script/build.ts` → `dist/public`                                  |

### Frontend-only Anthropic integration & CORS caveat

The Anthropic Messages API is called **directly from the browser**, with the `anthropic-dangerous-direct-browser-access: true` header set. This is intentional for a zero-infrastructure portfolio piece — there is no proxy, no server, no key on a backend.

The trade-off: browsers will block direct calls to `api.anthropic.com` unless the user's Anthropic workspace permits the dangerous-direct-browser-access header. When CORS blocks the request, the app surfaces a **polished red error banner** with a one-click "Try Demo Mode" CTA, rather than failing silently. See `client/src/lib/anthropic.ts` for the full error taxonomy (`cors | auth | rate | parse | network | unknown`).

The obvious next step for a production deployment is a thin proxy (Cloudflare Worker / Vercel Edge Function) holding a server-side key and forwarding requests. That is explicitly out of scope for v1 — the portfolio point is that the agent design and review UX stand on their own.

---

## Local setup

```bash
git clone https://github.com/PrabhjotAhluwalia/insightdraft.git
cd insightdraft
npm install
npm run dev      # http://localhost:5000
npm run build    # static output → dist/public
npm run check    # tsc, no emit
```

No environment variables are required to run the dev server. The Anthropic API key is entered through the in-app Settings dialog at runtime.

### Demo Mode vs. Live Mode

| Mode  | API key | Network calls       | Use when                                   |
|-------|---------|---------------------|--------------------------------------------|
| Demo  | not required | None — outputs are local | Reviewers, screenshots, offline walkthroughs |
| Live  | required (your `sk-ant-...` key) | Direct browser → Anthropic | You want real agent outputs on your data |

The Settings dialog accepts a key, validates the prefix, and persists it to `localStorage`. The key never leaves the browser except as the `x-api-key` header on requests to `api.anthropic.com`.

---

## Portfolio talking points

Things this project demonstrates that a senior AI PM portfolio should show:

- **Agent design as a product decision, not a prompt.** Each agent has a single, narrow job and a strict output contract. The handoff between agents is JSON — not prose — which is how you make multi-agent systems reviewable and debuggable.
- **Confidence as UX, not just a score.** The product treats calibration as a first-class concern: thresholds map to color, color maps to required reviewer action, and a sub-70 score flips a flag that gates export.
- **Hallucination containment by schema.** The "must include a verbatim quote" requirement is a product mechanism, not a model setting. Same for the "assumptions" field on themes.
- **An explicit eval framework before scaling.** The `/#/evals` page is written the way an AI PM should write one — faithfulness, coverage, calibration, actionability — with a concrete offline suite (quote grounding, theme coverage, acceptance simulation against Cohen's κ ≥ 0.6).
- **Privacy by design.** Client-side PII redaction before the network — the right default for any LLM tool that touches user research.
- **Reviewer-centered UX.** Accept / reject / edit per card, expandable assumptions, source-quote pinning, surfaced confidence. Built around the moment a PM has to defend the PRD they wrote.
- **A real demo path.** Demo Mode is a product choice — it acknowledges that a recruiter or reviewer will not have an Anthropic key in hand, and provides a 60-second walkthrough that exercises every screen.

---

## Project structure

```
client/
  src/
    App.tsx                       Hash router + providers
    components/
      AppShell.tsx                Header, nav, footer
      Logo.tsx                    Inline SVG mark
      SettingsDialog.tsx          API key affordance
      AgentProgress.tsx           4-step progress indicator
      PainPointsPanel.tsx         Researcher output
      ThemesPanel.tsx             Synthesis output, expandable assumptions
      FeatureCardReview.tsx       Strategy output + accept/reject/edit
      ConfidenceBadge.tsx         Semantic confidence + severity badges
    pages/
      Studio.tsx                  Main pipeline page
      EvalFramework.tsx           Internal PM doc on hallucination + calibration
      Privacy.tsx                 Data privacy policy
      not-found.tsx               404
    lib/
      anthropic.ts                Frontend Messages API client + CORS error UX
      prompts.ts                  The three system prompts (verbatim)
      pipeline.ts                 Orchestrator + normalization
      demo.ts                     Demo mode outputs
      sample.ts                   Sample input transcript
      pii.ts                      Client-side PII stripping
      storage.ts                  Safe localStorage wrapper
      exporter.ts                 Markdown export + copy/download
      types.ts                    Domain types
      util.ts                     id, clamp, confidence tone
```

The repo also contains an Express scaffold (`server/`) left over from the template. It is **not used** by the deployed app — the deploy artifact is the static `dist/public` output.

---

## Design notes

- Type: Inter (body) + Instrument Serif (display, editorial accent).
- Color: warm-neutral surface (`#F7F6F2`), one deep teal accent (`hsl(187 84% 22%)`), amber for review flags, semantic green/red for confidence.
- Logo: custom inline SVG — three vertical bars with a punctuation dot, symbolizing the human decision moment at the end of the pipeline.

---

## Testing affordances

Every interactive and display element carries a `data-testid` for stable selection. Examples:

- `button-load-sample`, `button-run-demo`, `button-run-live`
- `input-raw-research`, `input-anthropic-key`
- `card-feature-${id}`, `button-accept-${id}`, `button-reject-${id}`, `button-edit-${id}`
- `badge-confidence-green|amber|red`, `flag-review-${id}`
- `button-copy-md`, `button-download-md`

---

## License

MIT.
