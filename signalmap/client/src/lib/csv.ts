import type { TaggedReview, ParsedReview } from "./types";

export function exportTaggedCSV(parsed: ParsedReview[], tagged: TaggedReview[]) {
  const parsedById = new Map(parsed.map((p) => [p.review_id, p]));
  const header = [
    "review_id",
    "date",
    "raw_text",
    "sentiment",
    "sentiment_score",
    "intensity",
    "theme_cluster",
    "core_insight",
  ];
  const rows = tagged.map((t) => {
    const p = parsedById.get(t.review_id);
    return [
      t.review_id,
      p?.date ?? "",
      p?.raw_text ?? "",
      t.sentiment,
      t.sentiment_score.toString(),
      t.intensity,
      t.theme_cluster,
      t.core_insight,
    ];
  });
  const escape = (s: string) => `"${s.replace(/"/g, '""')}"`;
  const csv = [header, ...rows].map((r) => r.map((c) => escape(String(c))).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `signalmap-tagged-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
