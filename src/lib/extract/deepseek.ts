// DeepSeek V3 free-text extraction via OpenRouter.
//
// Used to fill in fields that the deterministic adapter parsing missed —
// typically description summarisation, briefing details from prose, and
// contact details buried in HTML. Not called on every tender — only on
// rows where required fields are missing.
//
// Cost: ~$0.27/1M input + $1.10/1M output. A 2000-token enrich call
// costs about $0.0005. At 500 tenders/day enriched = ~$0.25/day max.

import type { RawTender } from "../adapters/base";

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const MODEL = "deepseek/deepseek-chat";  // points to V3

const SYSTEM = `You are a procurement data extractor for a South African government tender database.
You receive raw tender text and return STRICT JSON matching the schema below.
Return ONLY the JSON object. No prose, no markdown fences, no commentary.

Schema:
{
  "summary": string (1-2 sentence plain-English description, max 250 chars),
  "procuring_entity": string | null,
  "closing_date": "YYYY-MM-DD" | null,
  "closing_time": "HH:MM" | null,
  "briefing_date": "YYYY-MM-DD" | null,
  "briefing_compulsory": boolean,
  "briefing_location": string | null,
  "contact_name": string | null,
  "contact_email": string | null,
  "contact_phone": string | null,
  "cidb_grade": string | null,
  "estimated_value_zar": number | null
}

Rules:
- If a field is genuinely unknown, return null (not "" or "unknown").
- closing_date / briefing_date MUST be ISO format YYYY-MM-DD.
- closing_time MUST be 24-hour HH:MM.
- cidb_grade examples: "5CE", "7GB", "2SE". Format: digit + 2-letter class code.
- estimated_value_zar: integer rands (not cents). Null if not stated.
- briefing_compulsory: true ONLY if the text explicitly says "compulsory" or "mandatory".`;

export interface ExtractionResult {
  summary?: string;
  procuring_entity?: string | null;
  closing_date?: string | null;
  closing_time?: string | null;
  briefing_date?: string | null;
  briefing_compulsory?: boolean;
  briefing_location?: string | null;
  contact_name?: string | null;
  contact_email?: string | null;
  contact_phone?: string | null;
  cidb_grade?: string | null;
  estimated_value_zar?: number | null;
}

export async function extractWithDeepSeek(
  apiKey: string,
  raw: { title: string; rawText: string }
): Promise<ExtractionResult> {
  const userMessage = `TITLE: ${raw.title}\n\nRAW TEXT:\n${raw.rawText.slice(0, 8000)}`;

  const res = await fetch(OPENROUTER_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`,
      "http-referer": "https://tenderpreneurs.co.za",
      "x-title": "Tenderpreneurs Ingestion",
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: userMessage },
      ],
      temperature: 0,
      max_tokens: 600,
      response_format: { type: "json_object" },
    }),
  });

  if (!res.ok) {
    throw new Error(`DeepSeek extraction failed: ${res.status} ${await res.text().catch(() => "")}`);
  }

  const data = (await res.json()) as any;
  const content = data?.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error("DeepSeek returned no content");
  }

  try {
    return JSON.parse(content);
  } catch {
    // The model occasionally wraps JSON in fences despite the instruction.
    const fenced = content.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fenced) return JSON.parse(fenced[1]);
    throw new Error(`DeepSeek returned non-JSON: ${content.slice(0, 200)}`);
  }
}

/**
 * Merge DeepSeek output into a raw tender, only overwriting empty fields.
 * Adapter-extracted fields always win — the LLM is a fallback, not a re-write.
 */
export function mergeExtraction(tender: RawTender, ex: ExtractionResult): RawTender {
  return {
    ...tender,
    description: tender.description || ex.summary || undefined,
    procuring_entity: tender.procuring_entity || ex.procuring_entity || undefined,
    closing_date: tender.closing_date || ex.closing_date || undefined,
    closing_time: tender.closing_time || ex.closing_time || undefined,
    briefing_date: tender.briefing_date || ex.briefing_date || undefined,
    briefing_compulsory: tender.briefing_compulsory ?? ex.briefing_compulsory,
    briefing_location: tender.briefing_location || ex.briefing_location || undefined,
    contact_name: tender.contact_name || ex.contact_name || undefined,
    contact_email: tender.contact_email || ex.contact_email || undefined,
    contact_phone: tender.contact_phone || ex.contact_phone || undefined,
    cidb_grade: tender.cidb_grade || ex.cidb_grade || undefined,
    estimated_value: tender.estimated_value || (ex.estimated_value_zar ? ex.estimated_value_zar * 100 : undefined),
  };
}
