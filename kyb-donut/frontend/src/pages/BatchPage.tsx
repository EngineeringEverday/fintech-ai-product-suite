import { useCallback, useEffect, useMemo, useState } from "react";
import { useDropzone } from "react-dropzone";
import { getJob, getJobResults, uploadBatch } from "@/lib/api";
import type { BatchJobResponse, BatchResultRow } from "@/types";
import { ConfidenceBadge } from "@/components/Confidence";

type SortKey = "document_filename" | "document_type" | "overall_confidence" | "needs_review";

export default function BatchPage() {
  const [job, setJob] = useState<BatchJobResponse | null>(null);
  const [results, setResults] = useState<BatchResultRow[]>([]);
  const [sortBy, setSortBy] = useState<SortKey>("overall_confidence");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [error, setError] = useState<string | null>(null);

  const onDrop = useCallback(async (accepted: File[]) => {
    if (!accepted[0]) return;
    setError(null);
    try {
      const j = await uploadBatch(accepted[0]);
      setJob(j);
    } catch (e: any) {
      setError(e?.message ?? "Upload failed");
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { "application/zip": [".zip"] },
    multiple: false,
  });

  // Poll job status
  useEffect(() => {
    if (!job?.job_id) return;
    let active = true;
    const tick = async () => {
      try {
        const j = await getJob(job.job_id);
        if (!active) return;
        setJob(j);
        if (j.status === "succeeded" || j.status === "failed") {
          const rows = await getJobResults(j.job_id);
          if (active) setResults(rows);
          return;
        }
      } catch {
        /* swallow polling errors */
      }
      if (active) setTimeout(tick, 1500);
    };
    tick();
    return () => {
      active = false;
    };
  }, [job?.job_id]);

  const sorted = useMemo(() => {
    const arr = [...results];
    arr.sort((a: any, b: any) => {
      const av = a[sortBy];
      const bv = b[sortBy];
      if (av === bv) return 0;
      const cmp = av > bv ? 1 : -1;
      return sortDir === "asc" ? cmp : -cmp;
    });
    return arr;
  }, [results, sortBy, sortDir]);

  function exportCsv() {
    if (!sorted.length) return;
    const headers = ["filename", "doc_type", "confidence", "needs_review", "review_reason", "processing_time_ms"];
    const lines = [headers.join(",")];
    for (const r of sorted) {
      lines.push(
        [
          JSON.stringify(r.document_filename),
          r.document_type,
          r.overall_confidence.toFixed(4),
          r.needs_review ? "yes" : "no",
          JSON.stringify(r.review_reason ?? ""),
          r.processing_time_ms,
        ].join(","),
      );
    }
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `kyb_batch_${job?.job_id ?? "results"}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const progress =
    job && job.total_docs > 0
      ? Math.round((job.completed_docs / job.total_docs) * 100)
      : job?.status === "running"
        ? 10
        : 0;

  return (
    <div className="space-y-6">
      <div
        {...getRootProps()}
        data-testid="dropzone-batch"
        className={`card p-10 border-dashed border-2 text-center cursor-pointer ${
          isDragActive ? "border-signal-500 bg-signal-50/40" : "border-canvas-300 dark:border-canvas-700"
        }`}
      >
        <input {...getInputProps()} data-testid="input-batch-zip" />
        <div className="text-canvas-700 dark:text-canvas-100 text-sm">
          <div className="text-base font-medium">Drop a .zip of merchant documents</div>
          <div className="mt-1 text-canvas-500 dark:text-canvas-300">
            Multiple doc types per zip · auto-detected · async via Celery + Redis
          </div>
        </div>
      </div>

      {error && (
        <div className="card p-4 text-conf-low text-sm">{error}</div>
      )}

      {job && (
        <div className="card p-5 space-y-3">
          <div className="flex items-center justify-between text-sm">
            <div>
              Job <span className="font-mono text-canvas-900 dark:text-canvas-50">{job.job_id}</span>
            </div>
            <span className="pill bg-canvas-100 dark:bg-canvas-700 text-canvas-700 dark:text-canvas-100 font-mono">
              {job.status}
            </span>
          </div>
          <div className="h-2 bg-canvas-100 dark:bg-canvas-700 rounded-full overflow-hidden">
            <div className="h-full bg-signal-500 transition-all" style={{ width: `${progress}%` }} />
          </div>
          <div className="text-xs text-canvas-500 flex gap-3">
            <span>Completed {job.completed_docs}/{job.total_docs}</span>
            {job.failed_docs > 0 && <span className="text-conf-low">Failed {job.failed_docs}</span>}
          </div>
        </div>
      )}

      {results.length > 0 && (
        <div className="card overflow-x-auto">
          <div className="flex items-center justify-between p-4">
            <div className="text-sm font-medium text-canvas-900 dark:text-canvas-50">
              {results.length} documents processed
            </div>
            <button data-testid="button-export-csv" className="btn-secondary" onClick={exportCsv}>
              Export CSV
            </button>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-canvas-50 dark:bg-canvas-700/40 text-xs uppercase text-canvas-500">
              <tr>
                <Th label="Filename" k="document_filename" sortBy={sortBy} setSortBy={setSortBy} sortDir={sortDir} setSortDir={setSortDir} />
                <Th label="Type" k="document_type" sortBy={sortBy} setSortBy={setSortBy} sortDir={sortDir} setSortDir={setSortDir} />
                <Th label="Confidence" k="overall_confidence" sortBy={sortBy} setSortBy={setSortBy} sortDir={sortDir} setSortDir={setSortDir} />
                <Th label="Review" k="needs_review" sortBy={sortBy} setSortBy={setSortBy} sortDir={sortDir} setSortDir={setSortDir} />
                <th className="px-4 py-2 text-left">Status</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((r) => (
                <tr
                  key={r.id}
                  data-testid={`row-result-${r.id}`}
                  className="border-t border-canvas-100 dark:border-canvas-700 hover:bg-canvas-50/60 dark:hover:bg-canvas-700/30"
                >
                  <td className="px-4 py-3 font-mono text-canvas-900 dark:text-canvas-50">
                    {r.document_filename}
                  </td>
                  <td className="px-4 py-3">{r.document_type}</td>
                  <td className="px-4 py-3"><ConfidenceBadge value={r.overall_confidence} /></td>
                  <td className="px-4 py-3">
                    {r.needs_review ? (
                      <span className="text-conf-mid">{r.review_reason}</span>
                    ) : (
                      <span className="text-conf-high">ok</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-canvas-500">
                    {r.processing_time_ms} ms
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Th({
  label, k, sortBy, setSortBy, sortDir, setSortDir,
}: {
  label: string;
  k: SortKey;
  sortBy: SortKey;
  setSortBy: (k: SortKey) => void;
  sortDir: "asc" | "desc";
  setSortDir: (d: "asc" | "desc") => void;
}) {
  const active = sortBy === k;
  return (
    <th
      className="px-4 py-2 text-left cursor-pointer select-none"
      data-testid={`th-${k}`}
      onClick={() => {
        if (active) setSortDir(sortDir === "asc" ? "desc" : "asc");
        else { setSortBy(k); setSortDir("asc"); }
      }}
    >
      {label}{active ? (sortDir === "asc" ? " ▲" : " ▼") : ""}
    </th>
  );
}
