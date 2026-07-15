import { useCallback, useState } from "react";
import { useDropzone, FileRejection } from "react-dropzone";
import { useNavigate } from "react-router-dom";
import { extractDoc } from "@/lib/api";
import { DOC_TYPE_LABELS, type DocType, type ExtractionResponse } from "@/types";

type Item = {
  id: string;
  file: File;
  docType: DocType | "auto";
  status: "queued" | "running" | "done" | "error";
  progress: number;
  result?: ExtractionResponse;
  error?: string;
  previewUrl: string;
};

function detectFromName(name: string): DocType {
  const n = name.toLowerCase();
  if (/(udyam|msme)/.test(n)) return "udyam";
  if (/(shop|estab|gumast)/.test(n)) return "shop_establishment";
  if (/(incorporat|mca|coi|\bcin\b)/.test(n)) return "incorporation";
  if (/(?:^|[^a-z])pan(?:[^a-z]|$)|pancard/.test(n)) return "pan";
  return "gst";
}

export default function UploadPage() {
  const [items, setItems] = useState<Item[]>([]);
  const nav = useNavigate();

  const onDrop = useCallback((accepted: File[], _rej: FileRejection[]) => {
    const next: Item[] = accepted.map((file) => ({
      id: `${file.name}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      file,
      docType: detectFromName(file.name),
      status: "queued",
      progress: 0,
      previewUrl: URL.createObjectURL(file),
    }));
    setItems((prev) => [...next, ...prev]);
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { "image/*": [".png", ".jpg", ".jpeg", ".webp"] },
    multiple: true,
  });

  async function process(item: Item) {
    setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, status: "running", progress: 30 } : i)));
    try {
      const result = await extractDoc(item.file, item.docType === "auto" ? undefined : item.docType);
      setItems((prev) =>
        prev.map((i) =>
          i.id === item.id ? { ...i, status: "done", progress: 100, result } : i,
        ),
      );
    } catch (e: any) {
      setItems((prev) =>
        prev.map((i) =>
          i.id === item.id ? { ...i, status: "error", error: e?.message ?? "Failed", progress: 100 } : i,
        ),
      );
    }
  }

  async function processAll() {
    for (const item of items.filter((i) => i.status === "queued")) {
      await process(item);
    }
  }

  function openResult(item: Item) {
    if (!item.result) return;
    nav("/result", {
      state: { result: item.result, fileName: item.file.name, previewUrl: item.previewUrl },
    });
  }

  return (
    <div className="space-y-6">
      <div
        {...getRootProps()}
        data-testid="dropzone-upload"
        className={`card p-10 border-dashed border-2 transition cursor-pointer text-center ${
          isDragActive ? "border-signal-500 bg-signal-50/40" : "border-canvas-300 dark:border-canvas-700"
        }`}
      >
        <input {...getInputProps()} data-testid="input-files" />
        <div className="text-canvas-700 dark:text-canvas-100 text-sm">
          <div className="text-base font-medium">Drop merchant KYB documents here</div>
          <div className="mt-1 text-canvas-500 dark:text-canvas-300">
            GST · PAN · Shop & Establishment · Certificate of Incorporation · Udyam
          </div>
          <div className="mt-3 text-xs text-canvas-500">
            Auto-detection from filename — change the document type per row if needed.
          </div>
        </div>
      </div>

      {items.length > 0 && (
        <div className="flex items-center justify-between">
          <div className="text-sm text-canvas-600 dark:text-canvas-300">
            {items.length} file{items.length === 1 ? "" : "s"} queued ·{" "}
            {items.filter((i) => i.status === "done").length} processed
          </div>
          <button
            data-testid="button-process-all"
            className="btn-primary"
            onClick={processAll}
            disabled={!items.some((i) => i.status === "queued")}
          >
            Process all
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {items.map((item) => (
          <div
            key={item.id}
            data-testid={`card-item-${item.id}`}
            className="card p-4 flex gap-4"
          >
            <img
              src={item.previewUrl}
              alt={item.file.name}
              className="w-28 h-28 object-cover rounded-md border border-canvas-200 dark:border-canvas-700 bg-canvas-50"
            />
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between">
                <div className="text-sm font-medium truncate text-canvas-900 dark:text-canvas-50">
                  {item.file.name}
                </div>
                <span className="pill bg-canvas-100 dark:bg-canvas-700 text-canvas-700 dark:text-canvas-100 font-mono">
                  {item.status}
                </span>
              </div>
              <div className="mt-2 flex gap-2 items-center">
                <select
                  data-testid={`select-doctype-${item.id}`}
                  className="input !py-1 !text-xs max-w-[200px]"
                  value={item.docType}
                  onChange={(e) =>
                    setItems((prev) =>
                      prev.map((i) =>
                        i.id === item.id ? { ...i, docType: e.target.value as DocType } : i,
                      ),
                    )
                  }
                >
                  {(Object.keys(DOC_TYPE_LABELS) as DocType[]).map((k) => (
                    <option key={k} value={k}>
                      {DOC_TYPE_LABELS[k]}
                    </option>
                  ))}
                </select>
                <button
                  data-testid={`button-process-${item.id}`}
                  className="btn-secondary !py-1 !text-xs"
                  disabled={item.status === "running"}
                  onClick={() => process(item)}
                >
                  Process
                </button>
                {item.result && (
                  <button
                    data-testid={`button-view-${item.id}`}
                    className="btn-primary !py-1 !text-xs"
                    onClick={() => openResult(item)}
                  >
                    View
                  </button>
                )}
              </div>
              <div className="mt-3 h-1.5 bg-canvas-100 dark:bg-canvas-700 rounded-full overflow-hidden">
                <div
                  className="h-full bg-signal-500 transition-all"
                  style={{ width: `${item.progress}%` }}
                />
              </div>
              {item.error && (
                <div className="mt-2 text-xs text-conf-low">{item.error}</div>
              )}
              {item.result && (
                <div className="mt-2 text-xs flex gap-3 text-canvas-600 dark:text-canvas-300">
                  <span>
                    Confidence{" "}
                    <span className="font-mono text-canvas-900 dark:text-canvas-50">
                      {(item.result.overall_confidence * 100).toFixed(1)}%
                    </span>
                  </span>
                  <span>
                    {item.result.processing_time_ms} ms
                  </span>
                  <span>
                    {item.result.needs_review ? (
                      <span className="text-conf-mid">needs review</span>
                    ) : (
                      <span className="text-conf-high">auto-approved</span>
                    )}
                  </span>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
