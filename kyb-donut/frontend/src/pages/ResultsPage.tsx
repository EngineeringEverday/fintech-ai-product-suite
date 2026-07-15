import { useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import type { ExtractionResponse } from "@/types";
import { DOC_TYPE_LABELS } from "@/types";
import { ConfidenceBadge, confidenceColor } from "@/components/Confidence";

type State = { result: ExtractionResponse; fileName: string; previewUrl: string };

export default function ResultsPage() {
  const loc = useLocation();
  const state = loc.state as State | null;
  const [edited, setEdited] = useState<Record<string, string>>({});

  if (!state) {
    return (
      <div className="card p-8 text-sm text-canvas-600 dark:text-canvas-300">
        No extraction selected.{" "}
        <Link to="/" className="text-signal-600 underline">
          Upload a document
        </Link>{" "}
        to get started.
      </div>
    );
  }

  const { result, fileName, previewUrl } = state;
  const fields = Object.entries(result.fields);

  // Mock bounding boxes (deterministic placement) - in production these would
  // come from the model's cross-attention map projected onto image coords.
  const boxes = useMemo(() => {
    return fields.map(([k], i) => ({
      key: k,
      top: 14 + i * 8,
      left: 30,
      width: 38,
      height: 6,
    }));
  }, [fields.length]);

  const businessName =
    result.fields["legal_name"]?.value ||
    result.fields["company_name"]?.value ||
    result.fields["enterprise_name"]?.value ||
    result.fields["establishment_name"]?.value ||
    result.fields["name"]?.value ||
    "(no business name)";

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm font-medium text-canvas-900 dark:text-canvas-50">{fileName}</div>
          <div className="text-xs text-canvas-500 dark:text-canvas-300">
            {DOC_TYPE_LABELS[result.document_type]} · {result.processing_time_ms} ms
          </div>
        </div>
        <div className="flex items-center gap-3">
          <ConfidenceBadge value={result.overall_confidence} size="md" />
          {result.needs_review ? (
            <span data-testid="badge-review" className="pill bg-conf-mid/10 text-conf-mid border border-conf-mid/30">
              Needs review · {result.review_reason}
            </span>
          ) : (
            <span data-testid="badge-approved" className="pill bg-conf-high/10 text-conf-high border border-conf-high/30">
              Auto-approved
            </span>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        <div className="card p-3">
          <div className="text-xs text-canvas-500 mb-2 px-1">Source document</div>
          <div className="relative">
            <img src={previewUrl} alt={fileName} className="w-full rounded-md" />
            {boxes.map((b) => (
              <div
                key={b.key}
                title={b.key}
                className="absolute border-2 border-signal-500/60 bg-signal-500/10 rounded-sm"
                style={{
                  top: `${b.top}%`,
                  left: `${b.left}%`,
                  width: `${b.width}%`,
                  height: `${b.height}%`,
                }}
              />
            ))}
          </div>
        </div>

        <div className="space-y-4">
          <div className="card p-5">
            <div className="text-xs text-canvas-500 mb-3">Extracted fields</div>
            <div className="space-y-3">
              {fields.map(([k, fe]) => (
                <div key={k} data-testid={`field-${k}`} className="grid grid-cols-12 gap-3 items-center">
                  <label className="col-span-4 text-xs uppercase tracking-wider text-canvas-500">
                    {k.replace(/_/g, " ")}
                  </label>
                  <input
                    data-testid={`input-${k}`}
                    className={`col-span-6 input font-mono text-sm ${confidenceColor(fe.confidence)}`}
                    defaultValue={fe.value ?? ""}
                    onChange={(e) => setEdited((p) => ({ ...p, [k]: e.target.value }))}
                  />
                  <div className="col-span-2 text-right">
                    <ConfidenceBadge value={fe.confidence} />
                  </div>
                  {fe.validation_error && (
                    <div className="col-span-12 col-start-5 text-[11px] text-conf-low font-mono">
                      ⚠ {fe.validation_error}
                    </div>
                  )}
                </div>
              ))}
            </div>
            <div className="mt-5 flex items-center gap-2">
              <button
                data-testid="button-approve"
                className="btn-primary"
                onClick={() => alert("Approved (and corrections logged for active learning).")}
              >
                Approve
              </button>
              <button
                data-testid="button-send-review"
                className="btn-secondary"
                onClick={() => alert("Sent to human review queue.")}
              >
                Send to review
              </button>
              <div className="text-xs text-canvas-500 ml-auto">
                {Object.keys(edited).length} field edit{Object.keys(edited).length === 1 ? "" : "s"} pending
              </div>
            </div>
          </div>

          <div className="card p-5">
            <div className="text-xs text-canvas-500 mb-2">Cross-document consistency</div>
            <div className="flex items-center justify-between">
              <div className="text-sm text-canvas-700 dark:text-canvas-100">
                Business name <span className="font-mono">{businessName}</span>
              </div>
              <ConfidenceBadge value={0.96} />
            </div>
            <div className="text-[11px] text-canvas-500 mt-1">
              Name token-set similarity is computed vs. all sibling docs in the same KYB
              dossier; threshold 0.85 flags mismatch.
            </div>
          </div>

          <div className="card p-5">
            <div className="text-xs text-canvas-500 mb-2">Raw JSON</div>
            <pre
              data-testid="text-raw-json"
              className="bg-canvas-900 text-canvas-100 rounded-md p-4 text-xs font-mono overflow-x-auto leading-relaxed"
            >
              {JSON.stringify(result.raw_json, null, 2)}
            </pre>
          </div>
        </div>
      </div>
    </div>
  );
}
