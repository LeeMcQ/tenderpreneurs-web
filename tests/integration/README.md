# Integration smoke test (R12)

The unit tests (`src/lib/**/*.test.ts`) cover pure logic. This harness covers the
**DB / auth / routing wiring** by hitting the real endpoints on a running dev server.

## Prerequisites
- D1 dev database with migrations applied:
  ```
  npx wrangler d1 execute <DB_NAME> --local --file=migrations/0003_intelligence.sql
  npx wrangler d1 execute <DB_NAME> --local --file=migrations/0004_verifier_reports.sql
  ```
- Some tender rows in the dev DB (otherwise data-dependent checks **skip**, not fail).

## Run
```
npm run build
npx wrangler pages dev ./dist            # terminal 1 (note the URL, e.g. http://localhost:8788)
BASE_URL=http://localhost:8788 npx tsx tests/integration/smoke.ts   # terminal 2
```

## What it checks
- `search` returns a tenders array + total.
- `win-score` (anon) returns `locked` (or a score) and is `no-store`.
- `verify` and `report` return valid JSON.
- `subscribe` rejects missing consent (400) and accepts valid consent (200) with a working opt-out link.
- `verify-cron` without the secret → 401; `verify-run` as anon → 403.

Exit code is non-zero if any check fails. To also exercise admin paths, set an admin session
cookie and `ADMIN_EMAILS`, then extend the harness with authenticated `verify-run` / `report-action`
calls.
