# Adapter Scaffolding Prompt

**Use case:** You need to add a new source (a metro, a provincial treasury, an SOE). Rather than writing the scraper yourself, hand this prompt to DeepSeek (cheap), Gemini Pro (free tier), or Claude Code in a separate session.

**Where to run:** Any capable code model. DeepSeek Coder via OpenRouter is the cost-optimal choice.

---

## Instructions

Paste this entire block as the user message. Replace `<<SOURCE_NAME>>` and `<<SOURCE_URL>>` before sending.

```
I need a TypeScript adapter for the Tenderpreneurs ingestion pipeline.

CONTEXT:
- Stack: Astro 4 on Cloudflare Pages, Cloudflare D1 (SQLite), TypeScript
- Existing pattern: adapters extend BaseAdapter, implement fetchListings() and optionally fetchDetail()
- HTML parsing: node-html-parser (already a dep)
- PDF parsing: pdf-parse (already a dep)
- No external state — adapters fetch from the source URL each run

REQUIREMENTS:
- Target source: <<SOURCE_NAME>> at <<SOURCE_URL>>
- Source ID slug (for the registry): <<SLUG>>
- Source type: 'national' | 'provincial' | 'metro' | 'soe' | 'bulletin'
- Province (if regional): <<PROVINCE_SLUG_OR_NULL>>

BASE ADAPTER CONTRACT (do not modify, this is given):
```typescript
import { BaseAdapter, type RawTender } from "./base";
import type { Env } from "../db";

export class MySourceAdapter extends BaseAdapter {
  readonly sourceId = "<<SLUG>>";
  readonly displayName = "<<SOURCE_NAME>>";
  readonly type = "<<TYPE>>" as const;

  async fetchListings(env: Env): Promise<RawTender[]> {
    // Your code here
  }

  async fetchDetail(env: Env, tender: RawTender): Promise<Partial<RawTender>> {
    // Optional enrichment
    return {};
  }
}
```

RawTender shape (required fields marked):
- source_id (REQUIRED, set to this.sourceId)
- source_ref (REQUIRED, the procuring entity's bid number)
- source_url (REQUIRED, canonical URL to the listing)
- title (REQUIRED)
- description, procuring_entity, province, category, closing_date, closing_time,
  briefing_date, briefing_compulsory, briefing_location, contact_*, cidb_grade,
  estimated_value, documents[], raw_html (all OPTIONAL)

DELIVERABLE:
- One TypeScript file, ~80-150 lines
- Production-defensible: timeouts, error handling, graceful skip on malformed entries
- No console.log except inside catch blocks
- Use this.safeFetch() (provided by BaseAdapter) — never raw fetch()
- Date parsing: emit ISO dates (YYYY-MM-DD). Use a small helper, not a library.

DO NOT:
- Add new npm dependencies
- Touch other files (registry, schema, base)
- Use any external service (no LLM calls in the adapter — those happen downstream)
```

---

## After the LLM produces the file

1. Save as `src/lib/adapters/<<SLUG>>.ts`
2. Register it in `src/lib/adapters/index.ts`:
   ```typescript
   import { MySourceAdapter } from "./<<SLUG>>";
   // and add `new MySourceAdapter()` to the ADAPTERS array
   ```
3. Add the seed row to `scripts/seed-sources.sql`
4. Test in isolation:
   ```bash
   wrangler d1 execute tenderpreneurs --command="INSERT OR IGNORE INTO sources (id, name, type, url) VALUES ('<<SLUG>>', '<<SOURCE_NAME>>', '<<TYPE>>', '<<SOURCE_URL>>');"
   curl -X POST -H "x-cron-secret: $SESSION_SECRET" https://tenderpreneurs.co.za/api/cron/ingest
   ```
5. Check D1 for the new rows:
   ```bash
   wrangler d1 execute tenderpreneurs --command="SELECT source_id, COUNT(*) FROM tenders GROUP BY source_id;"
   ```
