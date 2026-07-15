export type DocType =
  | "gst"
  | "pan"
  | "shop_establishment"
  | "incorporation"
  | "udyam";

export const DOC_TYPE_LABELS: Record<DocType, string> = {
  gst: "GST Registration",
  pan: "PAN Card",
  shop_establishment: "Shop & Establishment",
  incorporation: "Certificate of Incorporation",
  udyam: "Udyam / MSME",
};

export interface FieldExtraction {
  value: string | null;
  confidence: number;
  validated: boolean;
  validation_error: string | null;
}

export interface ExtractionResponse {
  document_type: DocType;
  fields: Record<string, FieldExtraction>;
  overall_confidence: number;
  processing_time_ms: number;
  needs_review: boolean;
  review_reason: string | null;
  validation_errors: string[];
  raw_json: Record<string, string | null>;
}

export interface MetricsResponse {
  total_docs_today: number;
  total_docs_all_time: number;
  avg_confidence: number;
  avg_processing_time_ms: number;
  human_review_rate: number;
  human_review_rate_target: number;
  docs_by_type: Record<string, number>;
  field_accuracy_by_type: Record<string, Record<string, number>>;
  confidence_trend_30d: { date: string; avg_confidence: number; count: number }[];
  recent_flagged: {
    id: number;
    document_filename: string;
    document_type: string;
    overall_confidence: number;
    review_reason: string;
    created_at: string;
  }[];
}

export interface BatchJobResponse {
  job_id: string;
  status: string;
  total_docs: number;
  completed_docs: number;
  failed_docs: number;
  created_at?: string;
}

export interface BatchResultRow {
  id: number;
  document_filename: string;
  document_type: string;
  overall_confidence: number;
  field_confidences: Record<string, number>;
  extracted_fields: Record<string, string>;
  validation_errors: string[];
  needs_review: boolean;
  review_reason: string | null;
  processing_time_ms: number;
}
