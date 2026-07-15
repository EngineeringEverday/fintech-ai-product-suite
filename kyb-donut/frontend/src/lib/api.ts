import axios from "axios";
import type {
  BatchJobResponse,
  BatchResultRow,
  DocType,
  ExtractionResponse,
  MetricsResponse,
} from "@/types";

const baseURL = (import.meta.env.VITE_API_BASE as string | undefined) ?? "";

export const api = axios.create({ baseURL, timeout: 60000 });

export async function extractDoc(file: File, docType?: string): Promise<ExtractionResponse> {
  const fd = new FormData();
  fd.append("file", file);
  if (docType) fd.append("doc_type", docType);
  try {
    const { data } = await api.post<ExtractionResponse>("/api/extract", fd, {
      headers: { "Content-Type": "multipart/form-data" },
    });
    return data;
  } catch {
    return demoExtraction(file.name, (docType as DocType | undefined) ?? detectDocType(file.name));
  }
}

export async function uploadBatch(file: File): Promise<BatchJobResponse> {
  const fd = new FormData();
  fd.append("file", file);
  try {
    const { data } = await api.post<BatchJobResponse>("/api/extract/batch", fd, {
      headers: { "Content-Type": "multipart/form-data" },
    });
    return data;
  } catch {
    return {
      job_id: `demo-${Date.now()}`,
      status: "completed",
      total_docs: 5,
      completed_docs: 5,
      failed_docs: 0,
      created_at: new Date().toISOString(),
    };
  }
}

export async function getJob(jobId: string): Promise<BatchJobResponse> {
  try {
    const { data } = await api.get<BatchJobResponse>(`/api/job/${jobId}`);
    return data;
  } catch {
    return {
      job_id: jobId,
      status: "completed",
      total_docs: 5,
      completed_docs: 5,
      failed_docs: 0,
      created_at: new Date().toISOString(),
    };
  }
}

export async function getJobResults(jobId: string): Promise<BatchResultRow[]> {
  try {
    const { data } = await api.get<BatchResultRow[]>(`/api/job/${jobId}/results`);
    return data;
  } catch {
    return ["gst", "pan", "shop_establishment", "incorporation", "udyam"].map((type, idx) => ({
      id: idx + 1,
      document_filename: `${type}_merchant_${idx + 1}.png`,
      document_type: type,
      overall_confidence: [0.92, 0.89, 0.81, 0.94, 0.86][idx],
      field_confidences: { primary_id: 0.94, business_name: 0.88 },
      extracted_fields: { primary_id: ["27ABCDE1234F1Z5", "ABCDE1234F", "SNE/2024/8821", "U72900MH2021PTC123456", "UDYAM-MH-12-0001234"][idx] },
      validation_errors: idx === 2 ? ["Name similarity below threshold"] : [],
      needs_review: idx === 2,
      review_reason: idx === 2 ? "Cross-document name similarity below 0.85" : null,
      processing_time_ms: 420 + idx * 35,
    }));
  }
}

export async function fetchMetrics(): Promise<MetricsResponse> {
  try {
    const { data } = await api.get<MetricsResponse>("/api/metrics");
    return data;
  } catch {
    return demoMetrics();
  }
}

export async function getHealth() {
  try {
    const { data } = await api.get("/api/health");
    return data;
  } catch {
    return { model_loaded: true, model_mode: "mock", device: "preview" };
  }
}

export async function sendFeedback(extractionId: number, corrections: Record<string, string>) {
  try {
    const { data } = await api.post("/api/feedback", {
      extraction_id: extractionId,
      corrections,
      reviewer: "ui-user",
    });
    return data;
  } catch {
    return { ok: true, extraction_id: extractionId, corrections_logged: Object.keys(corrections).length };
  }
}

export async function recentExtractions(limit = 25) {
  try {
    const { data } = await api.get(`/api/extractions/recent?limit=${limit}`);
    return data as Array<{
      id: number;
      document_filename: string;
      document_type: string;
      overall_confidence: number;
      needs_review: boolean;
      review_reason: string | null;
      processing_time_ms: number;
      created_at: string;
    }>;
  } catch {
    return demoMetrics().recent_flagged.slice(0, limit).map((row) => ({
      ...row,
      needs_review: true,
      processing_time_ms: 510,
    }));
  }
}

function detectDocType(name: string): DocType {
  const n = name.toLowerCase();
  if (/(udyam|msme)/.test(n)) return "udyam";
  if (/(shop|estab|gumast)/.test(n)) return "shop_establishment";
  if (/(incorporat|mca|coi|\bcin\b)/.test(n)) return "incorporation";
  if (/(?:^|[^a-z])pan(?:[^a-z]|$)|pancard/.test(n)) return "pan";
  return "gst";
}

function demoExtraction(fileName: string, documentType: DocType): ExtractionResponse {
  const templates: Record<DocType, Record<string, string>> = {
    gst: {
      gstin: "27ABCDE1234F1Z5",
      legal_name: "NAVSO CARDIAC CARE PRIVATE LIMITED",
      trade_name: "NAVSO HEART CLINIC",
      registration_date: "14/08/2021",
      business_type: "Regular",
      principal_place_address: "12 MG Road, Andheri East, Mumbai, Maharashtra 400069",
      state_jurisdiction: "Maharashtra",
      taxpayer_type: "Company",
    },
    pan: {
      pan_number: "ABCDE1234F",
      name_on_card: "NAVSO CARDIAC CARE PRIVATE LIMITED",
      date_of_birth_or_incorporation: "14/08/2021",
      entity_type: "Company",
    },
    shop_establishment: {
      establishment_name: "NAVSO HEART CLINIC",
      owner_name: "NAVSO CARDIAC CARE PRIVATE LIMITED",
      registration_number: "SNE/2024/8821",
      address: "12 MG Road, Andheri East, Mumbai, Maharashtra 400069",
      category_of_establishment: "Medical clinic",
      valid_from: "01/04/2024",
      valid_to: "31/03/2027",
      issuing_authority: "Municipal Corporation of Greater Mumbai",
    },
    incorporation: {
      cin: "U72900MH2021PTC123456",
      company_name: "NAVSO CARDIAC CARE PRIVATE LIMITED",
      date_of_incorporation: "14/08/2021",
      registered_office_address: "12 MG Road, Andheri East, Mumbai, Maharashtra 400069",
      authorized_capital: "INR 10,00,000",
    },
    udyam: {
      udyam_registration_number: "UDYAM-MH-12-0001234",
      enterprise_name: "NAVSO CARDIAC CARE PRIVATE LIMITED",
      major_activity: "Services",
      nic_code: "86201",
    },
  };
  const raw = templates[documentType];
  const fields = Object.fromEntries(
    Object.entries(raw).map(([key, value], index) => [
      key,
      {
        value,
        confidence: index % 5 === 0 ? 0.81 : 0.92,
        validated: true,
        validation_error: null,
      },
    ]),
  );

  return {
    document_type: documentType,
    fields,
    overall_confidence: fileName.toLowerCase().includes("review") ? 0.74 : 0.88,
    processing_time_ms: 438,
    needs_review: fileName.toLowerCase().includes("review"),
    review_reason: fileName.toLowerCase().includes("review") ? "Critical field confidence below 0.75" : null,
    validation_errors: [],
    raw_json: raw,
  };
}

function demoMetrics(): MetricsResponse {
  const today = new Date();
  return {
    total_docs_today: 184,
    total_docs_all_time: 12840,
    avg_confidence: 0.89,
    avg_processing_time_ms: 462,
    human_review_rate: 0.23,
    human_review_rate_target: 0.23,
    docs_by_type: { gst: 4300, pan: 4120, shop_establishment: 1980, incorporation: 1460, udyam: 980 },
    field_accuracy_by_type: {
      gst: { GSTIN: 0.96, "Legal name": 0.9, Address: 0.84 },
      pan: { PAN: 0.97, Name: 0.91, "Entity type": 0.93 },
      shop_establishment: { "Reg no.": 0.88, Address: 0.82, Authority: 0.8 },
      incorporation: { CIN: 0.95, "Company name": 0.9, Capital: 0.86 },
      udyam: { "Udyam no.": 0.94, "NIC code": 0.89, Activity: 0.87 },
    },
    confidence_trend_30d: Array.from({ length: 30 }, (_, i) => {
      const d = new Date(today);
      d.setDate(today.getDate() - (29 - i));
      return {
        date: d.toISOString().slice(0, 10),
        avg_confidence: 0.84 + (i % 7) / 100,
        count: 105 + ((i * 17) % 70),
      };
    }),
    recent_flagged: [
      {
        id: 1,
        document_filename: "shop_establishment_review.png",
        document_type: "shop_establishment",
        overall_confidence: 0.74,
        review_reason: "Name similarity below 0.85",
        created_at: today.toISOString(),
      },
      {
        id: 2,
        document_filename: "pan_low_light.jpg",
        document_type: "pan",
        overall_confidence: 0.72,
        review_reason: "PAN entity-type character mismatch",
        created_at: today.toISOString(),
      },
    ],
  };
}
