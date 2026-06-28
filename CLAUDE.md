# CLAUDE.md — Tenderpreneurs

Project context + guardrails for any AI coding agent (Claude Code, etc.) working in this repo.
Drop this at the repo root. It wires gstack and encodes the constraints every skill must respect.

## Project
Tenderpreneurs — AI-powered SA government tender intelligence SaaS.
- **Stack:** Astro 4 · Cloudflare Pages/Workers · D1 (SQLite) · R2 · GitHub Actions (cron).
- **Differentiators:** Win Probability AI (`src/lib/winscore.ts`) and the Tender Verifier
  (`src/lib/verifier/*` — deterministic rules + peer anomaly + multi-model reconciliation).
- **Payments:** PayFast (ZAR). **Email:** Resend. **Primary data:** etenders.gov.za OCDS feed.

## Non-negotiable guardrails (apply to ALL skills/changes)
1. **POPIA.** Supplier profiles, CSD numbers, B-BBEE, company data = personal info. Process only
   on SA-adequate infra. **DeepSeek (and other non-adequate processors) only for PUBLIC, no-PII
   data** (e.g. the verifier reads public tender text — that's fine; never send user profiles).
2. **Verifier = guidance, not legal advice.** `corpus.json` must stay versioned to the in-force
   PPPFA/PPR-2022 framework (PPA 2024 not yet proclaimed) and requires a procurement lawyer's
   sign-off before user-facing use. Models may cite ONLY the corpus — never invent legislation.
3. **Outbound email is hard-gated.** Never enable sending without `OUTBOUND_ENABLED=true` AND a
   recorded `entity_subscriptions` consent row AND POPIA-officer sign-off. The `send` action is
   blocked in code by design — keep it that way.
4. **Design system is one source of truth** (`src/styles/global.css` `--clr-*/--srf-*/--txt-*`).
   Do NOT reintroduce `--color-amber`, a green accent, or Plus Jakarta/Playfair (not loaded).
   Every interactive element ≥44px; mobile-first.
5. **Migrations are additive + forward-only.** Never auto-apply migrations to prod unreviewed.
6. **Cost discipline.** Claude for architecture/security/PII work; cheaper models for bulk no-PII
   generation. Multi-model verifier calls cost money — watch spend on `/benchmark`, `/codex`, cron.
7. **Tests before shipping.** Pure logic has unit tests (`src/lib/**/*.test.ts`, run with
   `npx tsx <file>`). Keep them green; add tests for new pure logic.

## gstack
Use /browse from gstack for all web browsing. Never use mcp__claude-in-chrome__* tools.
Available skills: /office-hours, /plan-ceo-review, /plan-eng-review, /plan-design-review,
/design-consultation, /design-shotgun, /design-html, /review, /ship, /land-and-deploy,
/canary, /benchmark, /browse, /open-gstack-browser, /qa, /qa-only, /design-review,
/setup-browser-cookies, /setup-deploy, /setup-gbrain, /sync-gbrain, /retro, /investigate,
/document-release, /document-generate, /codex, /cso, /autoplan, /pair-agent, /careful, /freeze,
/guard, /unfreeze, /gstack-upgrade, /learn.

### Project-specific skill routing
- Before exposing `/admin/*` or changing auth → run **/cso** (security audit).
- Any change touching `src/lib/verifier/*` or `winscore.ts` → **/review** then **/codex**
  (independent second model), because these are high-stakes (legal/PII) paths.
- UI work on tender list / detail / dashboard → **/plan-design-review** (before) and
  **/design-review** (after) against the `--clr-*` tokens above.
- Before merging DB or money (PayFast) changes → **/careful**; never **/land-and-deploy** a
  migration to prod without a human-approved review.
- After shipping → **/document-release** to keep README/ARCHITECTURE current.

## Safety defaults for this repo
- Treat `main` as production. Use **/guard** for prod-facing work.
- Keep `.env`, API keys, PayFast and Resend secrets out of commits and out of any AI memory sync.
- Do not point gstack's browser automation / cookie import / personal-automation at any page or
  data containing user PII (CSD, B-BBEE, supplier profiles).
