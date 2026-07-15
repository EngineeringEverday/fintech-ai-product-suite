import type { ParsedReview, TaggedReview, ClusterSynthesis, ThemeCluster } from "./types";

// 50 realistic mixed-sentiment app reviews spanning ~6 months across 7 themes.
export const SAMPLE_RAW_INPUT = `2024-08-04: App crashes every time I open the camera tab. Completely unusable on my Pixel 8.
2024-08-06: Love the new dashboard redesign — finally feels like a 2024 app, not 2014.
2024-08-09: Why am I being charged $14.99 when the website clearly says $9.99? Bait and switch.
2024-08-11: Support replied in 4 minutes. Genuinely shocked. Refunded me and apologized. 10/10.
2024-08-14: Two failed syncs in one week. Lost an entire week of workout data. Furious.
2024-08-15: The onboarding tour is the best I've seen in any productivity app. Clear, fast, skippable.
2024-08-19: I just want a dark mode. It's been three years.
2024-08-22: Performance has improved noticeably after the latest update. Scrolling is butter now.
2024-08-25: Got logged out three times during a meeting. Embarrassing.
2024-08-27: The new AI assist feature is a genuine 10x for my workflow. Worth the upgrade alone.
2024-09-02: Cancelled my subscription. Pricing keeps going up, value keeps going down.
2024-09-04: UI is gorgeous but I can't find the export button anywhere. Please add a search.
2024-09-07: First-time user here — sign-up was 15 seconds. Smoothest onboarding ever.
2024-09-10: App froze for 45 seconds when I tried to import a 200-row CSV. Not great.
2024-09-13: Two-factor auth broke after the update. Locked out of my own account for 8 hours.
2024-09-16: Support told me to "clear my cache" three times. I work in IT. Insulting.
2024-09-20: Honestly, $20/month is fair for what this does. Keep shipping features and I'll stay.
2024-09-22: Bluetooth pairing is wildly inconsistent. Works on iPhone, fails on Pixel.
2024-09-25: Feature request: please add Notion integration. It would close the loop for me.
2024-09-28: Nine-day streak of zero crashes. Whatever you fixed, thank you.
2024-10-02: The push notification volume is out of control. Twelve in one morning.
2024-10-04: Beautiful animations, but they slow down my old iPhone XS. Need a reduce-motion toggle.
2024-10-08: Refunded within 24 hours of request. No questions asked. Earned my trust back.
2024-10-12: Onboarding skipped me past the most important feature. Took me a week to find folders.
2024-10-15: App keeps disconnecting from my Fitbit. Hard to take seriously as a fitness tracker.
2024-10-19: New typography in v4.2 is so much more readable. Subtle but huge.
2024-10-22: Doubled the price for the family plan with two weeks notice. Not okay.
2024-10-26: Loading times went from 4s to under 1s after the October update. Night and day.
2024-10-29: Customer support ghosted me for 11 days on a billing issue. Eventually charged back.
2024-11-02: The new keyboard shortcuts are a productivity dream. Finally feels like a power tool.
2024-11-05: Crashed during a live demo in front of my client. Mortified.
2024-11-08: Settings menu is buried four taps deep. Why?
2024-11-11: Pricing page is honest and clear. No dark patterns. Refreshing.
2024-11-14: Sync between desktop and mobile is finally reliable. Took two years but we got there.
2024-11-17: Tutorial videos in onboarding are 8 minutes each. Way too long.
2024-11-20: Best support team I've dealt with in any SaaS this year. Real humans, real answers.
2024-11-23: App eats 12% of my battery in the background. Uninstalling.
2024-11-26: AI summary feature is hit or miss. Sometimes brilliant, sometimes hallucinates wildly.
2024-11-29: Bumped my plan and the upgrade flow took 60 seconds. Painless.
2024-12-02: Why is there no offline mode in 2024? I commute on the subway.
2024-12-05: Color palette in the new redesign is stunning. Like a real product, not a startup MVP.
2024-12-08: Three crashes in one day on iOS 18. Please test before shipping.
2024-12-11: Support resolved a sync issue I'd been fighting for months. Five-star team.
2024-12-14: $30/month for what used to be $12 two years ago. Find another customer.
2024-12-17: Onboarding email sequence is genuinely helpful. Not spammy. Thoughtful.
2024-12-20: Voice input is now flawless. I dictate full notes hands-free.
2024-12-23: Logged into a friend's account by accident — multi-account switching is broken.
2024-12-26: Mobile app finally has feature parity with desktop. About time.
2024-12-29: First impressions: clean, fast, and the empty states are charming.
2025-01-02: Latest update broke my widgets. They all show "—" now.
2025-01-05: The Slack integration is exactly what we needed. Whoever built it, well done.`;

// Pre-computed parsed/tagged/synthesis for the instant sample path.
const lines = SAMPLE_RAW_INPUT.split("\n").map((l) => l.trim()).filter(Boolean);

export const SAMPLE_PARSED: ParsedReview[] = lines.map((line, i) => {
  const m = line.match(/^(\d{4}-\d{2}-\d{2}):\s*(.+)$/);
  return {
    review_id: `r${(i + 1).toString().padStart(3, "0")}`,
    date: m ? m[1] : null,
    raw_text: m ? m[2] : line,
  };
});

// Manually tagged for an honest, plausible demo.
type Tag = Omit<TaggedReview, "review_id">;
const tags: Tag[] = [
  { sentiment: "negative", sentiment_score: -0.9, core_insight: "Camera tab crash on Pixel 8 blocks core flow.", intensity: "High", theme_cluster: "Reliability" },
  { sentiment: "positive", sentiment_score: 0.85, core_insight: "Dashboard redesign feels modern and current.", intensity: "Med", theme_cluster: "UX/Design" },
  { sentiment: "negative", sentiment_score: -0.85, core_insight: "Price discrepancy between site and checkout feels dishonest.", intensity: "High", theme_cluster: "Pricing" },
  { sentiment: "positive", sentiment_score: 0.95, core_insight: "Support responded in 4 minutes with a refund.", intensity: "High", theme_cluster: "Support" },
  { sentiment: "negative", sentiment_score: -0.95, core_insight: "Sync failures cost a week of workout data.", intensity: "High", theme_cluster: "Reliability" },
  { sentiment: "positive", sentiment_score: 0.9, core_insight: "Onboarding tour is best-in-class.", intensity: "High", theme_cluster: "Onboarding" },
  { sentiment: "negative", sentiment_score: -0.5, core_insight: "Dark mode still missing after three years.", intensity: "Med", theme_cluster: "Features" },
  { sentiment: "positive", sentiment_score: 0.7, core_insight: "Scrolling performance improved noticeably.", intensity: "Med", theme_cluster: "Performance" },
  { sentiment: "negative", sentiment_score: -0.6, core_insight: "Repeated session logouts during meetings.", intensity: "Med", theme_cluster: "Reliability" },
  { sentiment: "positive", sentiment_score: 0.95, core_insight: "AI assist drives 10x workflow gain.", intensity: "High", theme_cluster: "Features" },
  { sentiment: "negative", sentiment_score: -0.85, core_insight: "Rising prices outpace perceived value; churned.", intensity: "High", theme_cluster: "Pricing" },
  { sentiment: "neutral", sentiment_score: 0.1, core_insight: "Beautiful UI but export discoverability is poor.", intensity: "Med", theme_cluster: "UX/Design" },
  { sentiment: "positive", sentiment_score: 0.9, core_insight: "15-second sign-up is the smoothest onboarding seen.", intensity: "High", theme_cluster: "Onboarding" },
  { sentiment: "negative", sentiment_score: -0.6, core_insight: "Large CSV imports freeze the app.", intensity: "Med", theme_cluster: "Performance" },
  { sentiment: "negative", sentiment_score: -0.85, core_insight: "Broken 2FA locked user out for 8 hours.", intensity: "High", theme_cluster: "Reliability" },
  { sentiment: "negative", sentiment_score: -0.75, core_insight: "Generic 'clear cache' replies feel dismissive.", intensity: "High", theme_cluster: "Support" },
  { sentiment: "positive", sentiment_score: 0.5, core_insight: "$20/mo feels fair if feature velocity continues.", intensity: "Med", theme_cluster: "Pricing" },
  { sentiment: "negative", sentiment_score: -0.6, core_insight: "Bluetooth pairing inconsistent across Android.", intensity: "Med", theme_cluster: "Reliability" },
  { sentiment: "neutral", sentiment_score: 0.2, core_insight: "Notion integration would close a workflow loop.", intensity: "Low", theme_cluster: "Features" },
  { sentiment: "positive", sentiment_score: 0.85, core_insight: "Nine days crash-free — stability gains felt.", intensity: "High", theme_cluster: "Reliability" },
  { sentiment: "negative", sentiment_score: -0.55, core_insight: "Push notification frequency is overwhelming.", intensity: "Med", theme_cluster: "UX/Design" },
  { sentiment: "neutral", sentiment_score: 0.0, core_insight: "Animations need a reduce-motion toggle.", intensity: "Med", theme_cluster: "Performance" },
  { sentiment: "positive", sentiment_score: 0.9, core_insight: "Fast refund rebuilt trust.", intensity: "High", theme_cluster: "Support" },
  { sentiment: "negative", sentiment_score: -0.5, core_insight: "Onboarding hides folders — key feature missed for a week.", intensity: "Med", theme_cluster: "Onboarding" },
  { sentiment: "negative", sentiment_score: -0.65, core_insight: "Fitbit disconnects undermine fitness tracking claim.", intensity: "Med", theme_cluster: "Reliability" },
  { sentiment: "positive", sentiment_score: 0.6, core_insight: "Updated typography boosts readability.", intensity: "Low", theme_cluster: "UX/Design" },
  { sentiment: "negative", sentiment_score: -0.85, core_insight: "Sudden family-plan price doubling with little notice.", intensity: "High", theme_cluster: "Pricing" },
  { sentiment: "positive", sentiment_score: 0.95, core_insight: "Load times dropped 4x in one update.", intensity: "High", theme_cluster: "Performance" },
  { sentiment: "negative", sentiment_score: -0.9, core_insight: "11-day support silence on billing forced chargeback.", intensity: "High", theme_cluster: "Support" },
  { sentiment: "positive", sentiment_score: 0.85, core_insight: "New keyboard shortcuts unlock power-user workflows.", intensity: "High", theme_cluster: "Features" },
  { sentiment: "negative", sentiment_score: -0.95, core_insight: "Crash during a client demo was professionally damaging.", intensity: "High", theme_cluster: "Reliability" },
  { sentiment: "negative", sentiment_score: -0.45, core_insight: "Settings buried four taps deep hurts findability.", intensity: "Med", theme_cluster: "UX/Design" },
  { sentiment: "positive", sentiment_score: 0.7, core_insight: "Honest, transparent pricing page builds trust.", intensity: "Med", theme_cluster: "Pricing" },
  { sentiment: "positive", sentiment_score: 0.75, core_insight: "Cross-device sync finally reliable.", intensity: "High", theme_cluster: "Reliability" },
  { sentiment: "negative", sentiment_score: -0.4, core_insight: "8-minute tutorial videos are too long for onboarding.", intensity: "Low", theme_cluster: "Onboarding" },
  { sentiment: "positive", sentiment_score: 0.95, core_insight: "Best SaaS support experience of the year.", intensity: "High", theme_cluster: "Support" },
  { sentiment: "negative", sentiment_score: -0.85, core_insight: "12% background battery drain triggers uninstalls.", intensity: "High", theme_cluster: "Performance" },
  { sentiment: "neutral", sentiment_score: 0.1, core_insight: "AI summary quality is inconsistent.", intensity: "Med", theme_cluster: "Features" },
  { sentiment: "positive", sentiment_score: 0.65, core_insight: "Plan upgrade flow takes under a minute.", intensity: "Low", theme_cluster: "UX/Design" },
  { sentiment: "negative", sentiment_score: -0.6, core_insight: "Lack of offline mode hurts commuters.", intensity: "Med", theme_cluster: "Features" },
  { sentiment: "positive", sentiment_score: 0.8, core_insight: "Redesign color palette feels premium.", intensity: "Med", theme_cluster: "UX/Design" },
  { sentiment: "negative", sentiment_score: -0.85, core_insight: "Three iOS 18 crashes in a single day.", intensity: "High", theme_cluster: "Reliability" },
  { sentiment: "positive", sentiment_score: 0.85, core_insight: "Support resolved a months-old sync issue.", intensity: "High", theme_cluster: "Support" },
  { sentiment: "negative", sentiment_score: -0.95, core_insight: "Price tripled in two years; user churning.", intensity: "High", theme_cluster: "Pricing" },
  { sentiment: "positive", sentiment_score: 0.7, core_insight: "Onboarding email sequence is thoughtful and useful.", intensity: "Med", theme_cluster: "Onboarding" },
  { sentiment: "positive", sentiment_score: 0.9, core_insight: "Voice input is now flawless and hands-free.", intensity: "High", theme_cluster: "Features" },
  { sentiment: "negative", sentiment_score: -0.7, core_insight: "Multi-account switching mistakenly logs into other accounts.", intensity: "High", theme_cluster: "Reliability" },
  { sentiment: "positive", sentiment_score: 0.75, core_insight: "Mobile finally reaches desktop feature parity.", intensity: "Med", theme_cluster: "Features" },
  { sentiment: "positive", sentiment_score: 0.8, core_insight: "Empty states feel charming and considered.", intensity: "Med", theme_cluster: "UX/Design" },
  { sentiment: "negative", sentiment_score: -0.5, core_insight: "Latest update broke widgets — show dashes.", intensity: "Med", theme_cluster: "Reliability" },
  { sentiment: "positive", sentiment_score: 0.85, core_insight: "Slack integration nails a top user request.", intensity: "Med", theme_cluster: "Features" },
];

export const SAMPLE_TAGGED: TaggedReview[] = SAMPLE_PARSED.map((p, i) => ({
  review_id: p.review_id,
  ...tags[i % tags.length],
}));

// Build synthesis from tags
function buildSynthesis(): ClusterSynthesis[] {
  const clusters = new Map<ThemeCluster, TaggedReview[]>();
  for (const t of SAMPLE_TAGGED) {
    if (!clusters.has(t.theme_cluster)) clusters.set(t.theme_cluster, []);
    clusters.get(t.theme_cluster)!.push(t);
  }
  const out: ClusterSynthesis[] = [];
  for (const [name, items] of clusters) {
    const avg = items.reduce((s, x) => s + x.sentiment_score, 0) / items.length;
    const negatives = items.filter((x) => x.sentiment_score < 0).sort((a, b) => a.sentiment_score - b.sentiment_score);
    const positives = items.filter((x) => x.sentiment_score > 0).sort((a, b) => b.sentiment_score - a.sentiment_score);
    out.push({
      cluster_name: name,
      review_count: items.length,
      avg_sentiment_score: Number(avg.toFixed(2)),
      top_complaints: negatives.slice(0, 3).map((x) => x.core_insight),
      top_praises: positives.slice(0, 3).map((x) => x.core_insight),
      trend: avg > 0.2 ? "improving" : avg < -0.2 ? "worsening" : "stable",
      recommended_action: recommendation(name, avg),
      priority_score: Math.min(10, Math.max(1, Math.round((Math.abs(avg) * 4 + items.length / 2) * 10) / 10)),
    });
  }
  return out.sort((a, b) => b.priority_score - a.priority_score);
}

function recommendation(name: ThemeCluster, avg: number): string {
  if (avg < -0.3) {
    switch (name) {
      case "Reliability": return "Stabilize core flows — invest in crash-free sessions and sync reliability before new features.";
      case "Pricing": return "Audit pricing transparency and grandfathering policy; communicate changes earlier.";
      case "Support": return "Escalate macro-driven replies; staff for sub-12h first response on billing tickets.";
      case "Performance": return "Profile cold-start and background battery; target sub-1s loads on mid-tier devices.";
      case "Onboarding": return "Surface high-impact features (folders, search) in the first session, not in tutorials.";
      case "UX/Design": return "Reduce notification volume defaults and shorten settings depth.";
      case "Features": return "Triage the long tail; prioritize Notion/offline/dark mode requested repeatedly.";
    }
  }
  return `Maintain momentum on ${name}; monitor for regression and amplify wins in release notes.`;
}

export const SAMPLE_SYNTHESIS: ClusterSynthesis[] = buildSynthesis();
