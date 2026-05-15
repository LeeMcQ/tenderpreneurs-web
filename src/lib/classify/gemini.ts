// Sector + province classification.
//
// Primary: Google Gemini 1.5 Flash (free tier: 15 RPM / 1M TPM).
// Fallback: Groq Llama 3.3 70B Versatile (free tier generous).
//
// Both return the same JSON shape. We try Gemini first; on 429/5xx or
// timeout we fall through to Groq. This keeps classification free in
// practice up to ~20k tenders/day, which we won't approach.

import type { RawTender } from "../adapters/base";

const SECTORS = [
  "construction", "ict", "health", "education", "transport",
  "agriculture", "energy", "security", "consulting", "cleaning",
  "catering", "legal",
] as const;
type Sector = (typeof SECTORS)[number];

const PROVINCES = [
  "eastern-cape", "free-state", "gauteng", "kwazulu-natal", "limpopo",
  "mpumalanga", "northern-cape", "north-west", "western-cape", "national",
] as const;
type Province = (typeof PROVINCES)[number];

export interface Classification {
  sector: Sector;
  province: Province;
  confidence: number;       // 0-1
  reasoning?: string;       // short, for the audit trail
}

const SYSTEM = `You classify South African government tenders. Return STRICT JSON only.

Schema:
{
  "sector": one of: ${SECTORS.join(", ")},
  "province": one of: ${PROVINCES.join(", ")},
  "confidence": number between 0 and 1,
  "reasoning": short string (max 120 chars)
}

Rules:
- "national" province if the procuring entity is a national department or SOE (SANRAL, Eskom, Transnet, SITA, SARS, DBE, DOH National).
- A clinic build in Gauteng → sector=construction, province=gauteng (the WORK is construction).
- Otherwise classify by what the tender is BUYING, not who is buying.
- If torn between two sectors, pick the one matching the deliverable.`;

function buildUserMessage(t: RawTender): string {
  return [
    `TITLE: ${t.title}`,
    t.procuring_entity ? `PROCURING ENTITY: ${t.procuring_entity}` : "",
    t.description ? `DESCRIPTION: ${t.description.slice(0, 500)}` : "",
    t.category ? `CATEGORY HINT: ${t.category}` : "",
    t.cidb_grade ? `CIDB GRADE: ${t.cidb_grade}` : "",
  ].filter(Boolean).join("\n");
}

function validateClassification(c: any): Classification | null {
  if (!c || typeof c !== "object") return null;
  if (!SECTORS.includes(c.sector)) return null;
  if (!PROVINCES.includes(c.province)) return null;
  const conf = typeof c.confidence === "number" ? c.confidence : 0.5;
  return {
    sector: c.sector,
    province: c.province,
    confidence: Math.max(0, Math.min(1, conf)),
    reasoning: typeof c.reasoning === "string" ? c.reasoning.slice(0, 120) : undefined,
  };
}

async function classifyWithGemini(apiKey: string, tender: RawTender): Promise<Classification | null> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: SYSTEM }] },
      contents: [{ role: "user", parts: [{ text: buildUserMessage(tender) }] }],
      generationConfig: {
        temperature: 0,
        responseMimeType: "application/json",
        maxOutputTokens: 200,
      },
    }),
  });

  if (!res.ok) return null;
  const data = (await res.json()) as any;
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) return null;
  try {
    return validateClassification(JSON.parse(text));
  } catch {
    return null;
  }
}

async function classifyWithGroq(apiKey: string, tender: RawTender): Promise<Classification | null> {
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "llama-3.3-70b-versatile",
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: buildUserMessage(tender) },
      ],
      temperature: 0,
      max_tokens: 200,
      response_format: { type: "json_object" },
    }),
  });

  if (!res.ok) return null;
  const data = (await res.json()) as any;
  const content = data?.choices?.[0]?.message?.content;
  if (!content) return null;
  try {
    return validateClassification(JSON.parse(content));
  } catch {
    return null;
  }
}

export async function classify(
  geminiKey: string,
  groqKey: string,
  tender: RawTender
): Promise<Classification> {
  // Try Gemini first
  const gem = await classifyWithGemini(geminiKey, tender).catch(() => null);
  if (gem) return gem;

  // Fallback to Groq
  const groq = await classifyWithGroq(groqKey, tender).catch(() => null);
  if (groq) return groq;

  // Hard fallback: return "other" markers with zero confidence. The audit
  // will pick these up and the daily report will flag them for re-classification.
  return {
    sector: "consulting",   // least-wrong default for unknowns
    province: "national",
    confidence: 0,
    reasoning: "classification_failed",
  };
}
