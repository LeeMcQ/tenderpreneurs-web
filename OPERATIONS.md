# Tenderpreneurs Operations Runbook

This is the runbook for keeping the tender ingestion pipeline running.
Read it once end-to-end before your first deploy.

## First-time setup

### 1. Create Cloudflare resources

```bash
# D1 database
wrangler d1 create tenderpreneurs
# → Copy the database_id from the output into wrangler.toml under [[d1_databases]]

# R2 bucket (for archived PDFs)
wrangler r2 bucket create tenderpreneurs-tenders

# Apply the schema
wrangler d1 execute tenderpreneurs --remote --file=migrations/0001_tenders.sql

# Seed the source list
wrangler d1 execute tenderpreneurs --remote --file=scripts/seed-sources.sql
```

### 2. Set secrets

```bash
wrangler secret put OPENROUTER_API_KEY    # for DeepSeek extraction
wrangler secret put GEMINI_API_KEY        # for Gemini classification
wrangler secret put GROQ_API_KEY          # classification fallback
wrangler secret put RESEND_API_KEY        # magic-link + audit emails

# Generate strong secrets once:
openssl rand -hex 32   # → paste as MAGIC_LINK_SECRET
openssl rand -hex 32   # → paste as SESSION_SECRET
wrangler secret put MAGIC_LINK_SECRET
wrangler secret put SESSION_SECRET
```

### 3. Verify Resend sender

In your Resend dashboard, verify the sending domain `tenderpreneurs.co.za` (or a subdomain like `mail.tenderpreneurs.co.za`). Without verification, emails go to spam or get rejected.

### 4. First deploy

```bash
git add -A
git commit -m "Add tender ingestion pipeline"
git push
```

Cloudflare Pages auto-deploys. The cron triggers attach automatically based on `wrangler.toml`.

### 5. Wire up cron triggers

Cloudflare Pages doesn't run `scheduled()` handlers natively for typical projects, so you have two options. **Option A is simpler; use it unless you need the lower latency of B.**

**Option A: GitHub Actions cron (recommended)**

Add `.github/workflows/cron.yml` to your repo:

```yaml
name: Tenderpreneurs cron
on:
  schedule:
    - cron: '0 */6 * * *'      # ingestion every 6h
    - cron: '30 7 * * *'        # audit daily at 07:30 UTC
  workflow_dispatch:            # manual trigger from GitHub UI
jobs:
  trigger:
    runs-on: ubuntu-latest
    steps:
      - name: Run cron endpoint
        env:
          SECRET: ${{ secrets.CRON_SECRET }}
          BASE: https://tenderpreneurs.co.za
        run: |
          if [ "${{ github.event.schedule }}" = "30 7 * * *" ]; then
            curl -fsS -X POST -H "x-cron-secret: $SECRET" $BASE/api/cron/audit
          else
            curl -fsS -X POST -H "x-cron-secret: $SECRET" $BASE/api/cron/ingest
          fi
```

Add `CRON_SECRET` to GitHub repo secrets, value = your `SESSION_SECRET`.

**Option B: Cloudflare scheduled() via advanced Pages mode**

Move `_worker.ts` into your project root (it's already in the patch). In the Cloudflare dashboard → Pages → your project → Settings → Functions → Compatibility flags, add `nodejs_compat`. The `[triggers]` block in `wrangler.toml` will then activate.

This requires "advanced" mode which has some routing constraints. If you're not already using it, Option A is faster.

### 6. First manual smoke test

```bash
# Trigger ingestion once (replace $SECRET with your SESSION_SECRET):
curl -X POST -H "x-cron-secret: $SECRET" \
  https://tenderpreneurs.co.za/api/cron/ingest

# Trigger audit email manually:
curl -X POST -H "x-cron-secret: $SECRET" \
  https://tenderpreneurs.co.za/api/cron/audit

# Verify rows exist:
wrangler d1 execute tenderpreneurs --remote \
  --command="SELECT source_id, COUNT(*) FROM tenders GROUP BY source_id;"
```

---

## Daily / weekly cadence

- **Daily:** Read the audit email. The "Sources needing attention" section flags any scraper that's failed for >48h. Fix or disable.
- **Weekly:** Spot-check 10 tenders for classification accuracy. If sector/province is wrong on more than 1 in 10, retune the classifier prompt in `src/lib/classify/gemini.ts`.
- **Monthly:** Review `outsourcing/` prompts — government sites change layout periodically and your adapters will drift.

---

## Common operations

### Disable a broken source temporarily

```sql
UPDATE sources SET active = 0 WHERE id = 'some-broken-source';
```

The ingestion cron will skip it. Re-enable with `active = 1`.

### Force-reclassify a tender

```sql
UPDATE tenders SET llm_classified_at = NULL WHERE id = '<ulid>';
```

Then trigger ingestion — the persist path will reclassify rows with stale or missing classification on the next run. (Or run Gemini manually via `outsourcing/02-gemini-classification.md`.)

### Investigate a duplicate

```sql
-- Find a tender's duplicates
SELECT id, source_id, source_ref, title, first_seen_at
FROM tenders
WHERE id = '<canonical-id>'
   OR canonical_ref = '<canonical-id>';
```

### See ingestion run history

```sql
SELECT source_id, status, items_found, items_new, duration_ms, started_at, error_message
FROM ingestion_runs
WHERE started_at > datetime('now', '-1 day')
ORDER BY started_at DESC;
```

### Manually invalidate a session (force a user to re-auth)

```sql
UPDATE sessions SET revoked_at = datetime('now') WHERE user_id = '<user-ulid>';
```

---

## Adding a new source adapter

1. Open `outsourcing/03-write-new-adapter.md`
2. Hand the prompt to DeepSeek Coder or Gemini Pro (free tiers handle this)
3. Save the file as `src/lib/adapters/<slug>.ts`
4. Register in `src/lib/adapters/index.ts`
5. Add seed row to `scripts/seed-sources.sql`
6. Apply: `wrangler d1 execute tenderpreneurs --remote --file=scripts/seed-sources.sql`
7. Deploy and trigger ingestion manually with the curl command above

Aim for 1 new adapter per week. Priority order:
1. City of Cape Town
2. City of Joburg
3. eThekwini
4. SANRAL
5. Eskom
6. Tshwane / Ekurhuleni
7. Remaining metros and provincial treasuries
8. Smaller SOEs

---

## Cost ceiling

At the current architecture and a target of 1000 tenders ingested per day:

| Service | Free tier headroom | Estimated monthly cost |
|---|---|---|
| Cloudflare Pages / D1 / R2 / Workers | Generous | $0 (likely) |
| OpenRouter (DeepSeek for extraction) | Pay-per-use | ~$3-8/month |
| Gemini 1.5 Flash | 15 RPM / 1M TPM | $0 |
| Groq Llama 3.3 70B (fallback) | Generous | $0 |
| Resend (magic links + audit) | 3000 emails/month | $0 until users hit 100/day |

Total: under $10/month at the current scale. Scales sub-linearly with traffic since classification is free and extraction is cheap.

---

## Things to add later

- Sentry for error monitoring (env var `SENTRY_DSN`)
- Cloudflare Analytics Engine for ingestion run metrics over time
- Tender alert emails (per user, based on bookmarked sectors/provinces) — needs a third cron
- Bid document text search (use D1 FTS5 virtual table)
- Win probability scoring (use the formula from blog/how-win-probability-is-calculated.mdx)
- Paid tier gate (Paystack / Stripe) — `users.tier` is already there

---

## When something breaks

1. Check the most recent audit email — it'll usually tell you which source is failing
2. Check `ingestion_runs` for error messages
3. Hit the source URL manually — if the site is down or restructured, that's your answer
4. If a parser broke because the site restructured, the fastest path is to ask DeepSeek (via `outsourcing/03-write-new-adapter.md`) to rewrite that one adapter — usually a 5-minute job
