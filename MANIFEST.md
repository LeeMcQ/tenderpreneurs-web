# Tenderpreneurs — Clean Files for Upload (v5: full plan complete)

Complete latest version of every changed file at correct repo paths. **52 source files**
(41 new, 11 modified) + `CLAUDE.md` + `Implementation-Plan.md`.

## ⚠️ One manual deletion
```
git rm src/pages/tenders.astro
```

## Verification (this exact state)
- ✅ **96 unit tests pass** · ✅ **full `astro build` succeeds** · ✅ **zero type errors in changed files**.

## What's new in v5 (the last two open items)
- **R9 — rate-limiting** (`src/lib/rate-limit.ts` + 6 tests). KV-backed fixed-window limiter wired
  into the cost-bearing endpoints: `verify` (20/min/IP) and `verify-run` (30/min/IP). **Degrades to
  a no-op if no KV binding exists**, so it's safe to deploy now and "switches on" once you add KV:
  ```
  # wrangler.toml
  [[kv_namespaces]]
  binding = "RATE_LIMIT_KV"
  id = "<your-namespace-id>"
  ```
- **R12 — integration smoke test** (`tests/integration/smoke.ts` + README). Runs against a local
  `wrangler pages dev` server and exercises the DB/auth/routing wiring the unit tests can't.
  Data-dependent checks skip (don't fail) when the dev DB is empty.

With these, **the entire implementation plan (Phases 1–5 + all review items R1–R14) is complete.**
The only thing left for full R9 effect is creating the KV namespace; R12 is runnable on your machine.

## Everything delivered (recap)
- **Win Probability AI** (`winscore.ts`, server-side resolver, explainable, thin-data + closing-time aware, CIDB suffix parsing).
- **Tender Verifier** — deterministic rules + corpus + full taxonomy + safety parser + 4-engine
  ensemble (Claude/Gemini/ChatGPT/DeepSeek) + reconciler + admin review queue + publish-on-page + cron.
- **Entity opt-in** subscription flow (consent capture + signed opt-out), outbound hard-gated.
- **Phase 1–2:** design-system consolidation, SSR'd tenders list, win-ring + decision fields +
  urgency on cards, mobile filter sheet + chips, skeletons, debounced search.
- **Phase 3–5:** JSON-LD, sitemap landing pages, font trim, contrast/focus/aria, trust stamps,
  band-first win UI, no-store score, rate-limiting, integration harness.

## Upload steps
1. Extract over your clone; `git rm src/pages/tenders.astro`.
2. `npm install` → `npm run build` (and ideally `npm run check`).
3. Migrations `0003` then `0004` on D1.
4. Set env: `ADMIN_EMAILS`, `OUTBOUND_ENABLED=false`, `UNSUB_SECRET`, `CRON_SECRET`, engine keys.
   Optional: add the `RATE_LIMIT_KV` namespace to activate rate-limiting.
5. (Optional) run `tests/integration/smoke.ts` against `wrangler pages dev` — see its README.
6. Commit + push.

## Still gated by policy (by design)
Outbound email stays off (`OUTBOUND_ENABLED=false`) until POPIA/legal sign-off; the verifier
corpus needs procurement-lawyer review before user-facing output.
