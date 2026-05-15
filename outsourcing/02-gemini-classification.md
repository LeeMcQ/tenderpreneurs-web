# Gemini 1.5 Flash — Tender Classification Prompt

**Use case:** A tender came in with low classification confidence (the daily audit will flag these), and you want to reclassify it manually OR you want to bulk-classify a batch of older tenders.

**Where to run:** [Google AI Studio](https://aistudio.google.com/) → model: `gemini-1.5-flash` → set temperature to 0 → set response MIME type to `application/json` → paste the system instruction below, then paste tender details.

**Cost per run:** Free under the 15 RPM / 1M TPM tier. Use Groq as overflow.

---

## System instruction (paste into "System Instructions")

```
You classify South African government tenders. Return STRICT JSON only.

Schema:
{
  "sector": one of: construction, ict, health, education, transport, agriculture, energy, security, consulting, cleaning, catering, legal,
  "province": one of: eastern-cape, free-state, gauteng, kwazulu-natal, limpopo, mpumalanga, northern-cape, north-west, western-cape, national,
  "confidence": number between 0 and 1,
  "reasoning": short string (max 120 chars)
}

Rules:
- "national" province if the procuring entity is a national department or SOE (SANRAL, Eskom, Transnet, SITA, SARS, DBE, DOH National).
- A clinic build in Gauteng → sector=construction, province=gauteng (the WORK is construction).
- Otherwise classify by what the tender is BUYING, not who is buying.
- If torn between two sectors, pick the one matching the deliverable.
```

---

## User message format

```
TITLE: <tender title>
PROCURING ENTITY: <department or entity>
DESCRIPTION: <first 500 chars of description>
CATEGORY HINT: <goods | services | construction | other>
CIDB GRADE: <e.g. 5CE if present>
```

---

## Bulk classification workflow

To reclassify a batch of tenders flagged in the daily audit:

1. Export them from D1:
   ```bash
   wrangler d1 execute tenderpreneurs --command="SELECT id, title, procuring_entity, description, category, cidb_grade FROM tenders WHERE llm_classified_at < date('now', '-30 days') OR sector IS NULL LIMIT 100" > batch.json
   ```

2. For each row, build the user message and call Gemini.

3. UPDATE the row:
   ```sql
   UPDATE tenders SET sector = ?, province = COALESCE(province, ?), llm_classified_at = datetime('now') WHERE id = ?;
   ```

If the Gemini free tier rate-limits you mid-batch, switch to Groq with the same prompt — the schema is identical.
