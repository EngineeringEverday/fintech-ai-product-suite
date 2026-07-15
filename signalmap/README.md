# SignalMap

**AI product-intelligence dashboard that clusters app reviews into semantic themes with sentiment timelines.**

A senior-PM-grade tool that chains three Claude agents to turn raw, unstructured review text into actionable product strategy — themed clusters, sentiment trends, top complaints and praises, and a recommended action per theme.

[**Live preview →**](https://www.perplexity.ai/computer/a/signalmap-kmJGqFqFRZuiUPlt12aqMg)

---

## Overview

Most "review analytics" tools rely on keyword matching. They miss the fact that *"$30 is too much,"* *"cancelled my subscription,"* and *"find another customer"* are all the same **Pricing** signal. They cannot tell *"crashed during a client demo"* (Reliability) from *"the interface feels cluttered"* (UX/Design).

SignalMap solves this by chaining three purpose-built Claude agents over your raw review text:

1. A **Parser agent** that extracts structured records (id, date, text) from free-form input.
2. A **Semantic Tagger** that assigns sentiment, intensity, a one-line core insight, and exactly one of seven theme clusters per review.
3. A **Synthesis agent** that rolls each cluster up into a PM-grade brief — top complaints, top praises, trend direction, recommended action, and a 1–10 priority score.

The output is a single-screen dashboard a PM can hand to engineering or executives the same day.

---

## Key features

- **Three-agent AI pipeline** powered by Claude Sonnet — no keyword matching, no manual tagging.
- **Semantic theme clusters** (Performance, UX/Design, Pricing, Support, Reliability, Onboarding, Features) with per-cluster sentiment, intensity, and trend.
- **Bubble grid view** for at-a-glance triage and a **detail drawer** with verbatims, top complaints, top praises, and a recommended action.
- **Sentiment timeline** built on Recharts — see how each theme is trending over the window of reviews.
- **CSV export** of the fully tagged review set for downstream tooling (BI, Sheets, ticketing).
- **localStorage persistence** — your input, parsed output, tagged output, synthesis, and triage status survive a refresh.
- **Triage workflow**: mark clusters as New / In review / Action / Resolved.
- **Sample-data path**: explore the dashboard end-to-end without an API key.
- **Bring-your-own-key**: paste an Anthropic key to run on your own review corpus (key never leaves the browser).

---

## AI agent pipeline

The pipeline is intentionally simple — three sequential prompts, each running on the structured output of the previous one. Source: [`client/src/lib/claude.ts`](client/src/lib/claude.ts).

| # | Agent | Input | Output | Why it matters |
|---|-------|-------|--------|----------------|
| 1 | **Parser** | Raw review text (pasted, one per line, optional `YYYY-MM-DD:` prefix) | `[{ review_id, date, raw_text }]` | Frees PMs from regex/CSV plumbing; tolerates messy real-world input. |
| 2 | **Semantic Tagger** | Parsed reviews | `[{ review_id, sentiment, sentiment_score, core_insight, intensity, theme_cluster }]` | Captures the *meaning* behind each review and lands it in the right cluster — sarcasm, idiom, and product context included. |
| 3 | **Synthesis** | Tagged reviews | `[{ cluster_name, review_count, avg_sentiment_score, top_complaints[3], top_praises[3], trend, recommended_action, priority_score }]` | Produces an executive-ready brief per theme. Priority scores make trade-offs explicit. |

All three agents return strict JSON. The frontend extracts the JSON array robustly (strips code fences, tolerates preamble) and feeds the next stage.

---

## Tech stack

- **React 18** + **TypeScript 5.6** + **Vite 7**
- **TailwindCSS 3** with custom glassmorphism, **shadcn/ui** + **Radix UI** primitives
- **Recharts** for the sentiment timeline
- **Wouter** for client routing
- **TanStack Query** for async state
- **Anthropic Claude Sonnet** (`claude-sonnet-4-20250514`) as the model behind all three agents
- **Express 5** server (lightweight static host for the built bundle)
- **Drizzle ORM** + **better-sqlite3** wired in for optional persistence (not required for the dashboard demo)

---

## Quick start

### Prerequisites

- Node.js 20+
- (Optional) an Anthropic API key — only required to run the pipeline on your own reviews. The sample-data path works without one.

### Run locally

```bash
npm install
npm run dev
```

This starts the Express + Vite dev server. Open the URL it prints (defaults to `http://localhost:5173` for the Vite client routed through Express).

### Build for production

```bash
npm run build
npm start
```

`npm run build` bundles the client into `dist/public` and the server into `dist/index.cjs`. `npm start` serves the production bundle on `NODE_ENV=production`.

### Type-check

```bash
npm run check
```

---

## Architecture notes

```
client/             React + Vite frontend (the dashboard)
  src/
    pages/Home.tsx          Top-level dashboard + How-it-works tabs
    components/             Bubble grid, cluster list/drawer, timeline, input panel
    lib/claude.ts           Three-agent pipeline (Parser → Tagger → Synth)
    lib/clusters.ts         Cluster aggregation + sentiment math
    lib/storage.ts          localStorage helper with in-memory fallback
    lib/csv.ts              Tagged-review CSV export
    lib/sampleData.ts       Sample reviews + canned pipeline output
server/             Express 5 host (static in prod, Vite middleware in dev)
shared/             Shared Zod schema (forward-looking — server persistence)
```

The dashboard is a **single-page React app**. Pipeline state is held in component state and mirrored to `localStorage`, so a page refresh restores everything you've run. The Express server is a thin shell whose job is to serve the bundle in production and proxy Vite in development; the three-agent pipeline runs client-side.

---

## Sample demo behavior

Click **Try sample data** in the dashboard header to load a curated set of 30 representative reviews and their pre-computed pipeline output. The dashboard renders immediately:

- **Bubble grid** with seven theme cards, each colored by net sentiment.
- **Sentiment timeline** rendering the sample's daily averages per cluster.
- **Cluster list** sorted by priority score; click any cluster to open the **drawer** with verbatims, top complaints, top praises, recommended action, and triage controls.
- **Export CSV** to download the full tagged review set.

The sample path requires no API key and is the recommended way to evaluate the dashboard quickly.

---

## CSV export & localStorage notes

- **CSV export** (`client/src/lib/csv.ts`) emits one row per tagged review with `review_id, date, raw_text, sentiment, sentiment_score, intensity, core_insight, theme_cluster`. RFC-4180-style quoting, UTF-8, `Content-Disposition` download trigger from the browser.
- **localStorage** persistence uses keys under `signalmap.*` (raw input, parsed, tagged, synthesis, triage statuses). A small in-memory fallback kicks in when the browser blocks storage (sandboxed iframes, private mode, quota errors), so the dashboard never crashes on a hostile storage environment.
- The Anthropic API key is **only** persisted when the user explicitly checks "remember key." Otherwise it lives in component state and is dropped on page close.

---

## ⚠️ Production caveat: browser-direct Anthropic calls

SignalMap calls the Anthropic API **directly from the browser** using the `anthropic-dangerous-direct-browser-access` header. This is intentional for a portfolio demo — it keeps the surface area minimal, lets reviewers BYOK, and removes any server-side key handling.

**For production use, do not ship this pattern as-is.** Specifically:

- The API key is visible to anyone running the app in their browser. Even with "remember key" off, the key is in memory and DevTools-accessible.
- CORS and rate-limit behavior depend on Anthropic's allowlist for browser origins. Direct browser access can be revoked or throttled.
- There is no per-user quota, abuse protection, or audit log.

**Recommended production architecture:** route all three agent calls through a server proxy you control. Hold the Anthropic key server-side, attach per-user authentication and rate limiting, and log requests for audit. The frontend should send raw review text to your proxy and receive structured results — no key ever touches the browser. Adapting SignalMap to this model is a 1-file change (`client/src/lib/claude.ts` → fetch your proxy instead of `api.anthropic.com`).

---

## Portfolio / PM framing

SignalMap is part of my AI PM portfolio. It exists to demonstrate:

- **Product judgment** — picking a problem (PMs drowning in unstructured feedback) and a solution (an opinionated, agent-driven workflow) that a senior PM team would actually adopt.
- **Agent design** — composing three single-responsibility prompts into a pipeline whose output is directly usable, not a chat transcript.
- **End-to-end execution** — schema design, prompt engineering, JSON-tolerance, sentiment math, dashboard UX, CSV export, persistence, error handling, and an honest "limitations" section.
- **Production-readiness reasoning** — knowing where the demo cuts corners (browser-direct API calls) and articulating exactly how to harden it.

If you're hiring AI/ML PMs and want to talk about how this was scoped, what I'd build next (server proxy, custom cluster taxonomies, multi-source ingestion, longitudinal tracking), or how the prompt design trades off between strictness and resilience — happy to chat.

---

## License

MIT
