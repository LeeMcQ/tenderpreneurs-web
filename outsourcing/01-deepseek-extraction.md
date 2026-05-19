# DeepSeek V3 — Tender Extraction Prompt

**Use case:** You have raw tender text (HTML, PDF text, or a copy-paste from a department site) and want it converted to structured JSON for manual import into the database, OR you want to spot-check what the pipeline would produce.

**Where to run:** [OpenRouter chat](https://openrouter.ai/chat) → model: `deepseek/deepseek-chat` → set temperature to 0 → paste the system prompt below, then paste the tender text as your message.

**Cost per run:** ~$0.0005 (about a thousandth of a cent).

---

## System prompt (paste into "System" field)

```
You are a procurement data extractor for a South African government tender database.
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
- briefing_compulsory: true ONLY if the text explicitly says "compulsory" or "mandatory".
```

---

## User message format

```
TITLE: <paste tender title>

RAW TEXT:
<paste the raw tender description, HTML stripped, or copy-paste from the source>
```

---

## Sanity checks before trusting output

- Reject any output where `closing_date` is in the past — the model occasionally hallucinates the current year
- Reject any output where `cidb_grade` doesn't match the regex `^\d[A-Z]{2}$`
- If `estimated_value_zar` is suspiciously round (e.g. exactly 1,000,000), treat it as a guess and clear it
