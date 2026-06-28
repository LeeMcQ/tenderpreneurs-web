# Tenderpreneurs — Implementation Plan (remaining work)

The four genuine bugs are fixed (see "Fixed" below). This plan covers everything else raised
across the review reports that was **analysis only** — sequenced by return-on-effort, with effort
(S ≈ <½ day, M ≈ 1–2 days, L ≈ 3–5 days) and the files involved. Each item is sized to be a single
task you can hand to an LLM with the universal prompt + the project `CLAUDE.md`.

## ✅ Already fixed this round
- **R4** win-score now honours `closing_time` (a tender past its time today reads as closed).
- **R3** thin-data guard (sparse tenders no longer read as a confident "medium" fit).
- **Route collision** `src/pages/tenders.astro` deleted — `/tenders` now resolves only to the live page.
- **Counts** cadence centralised in `TENDER_STATS.refreshHours`; misleading "of many" placeholder removed.

---

## Phase 1 — Foundations (do first; everything visual inherits these)
**1.1 Consolidate the design system** — *L*
Collapse the 4 golds / green nav / two unloaded fonts into one token set in `global.css`; map
`tailwind.config` to it; refactor `tenders/index.astro` (inline `--color-amber`) and the detail
page (slate/amber utilities) onto the tokens. *Files:* `global.css`, `globals.css`,
`tailwind.config.mjs`, `BaseLayout.astro`, `MobileBottomNav.jsx`, `tenders/index.astro`,
`tenders/t/[id].astro`. *Why first:* every UI item below should be built against the final tokens.

**1.2 SSR the first page of `/tenders`** — *M*
Server-render the initial results (5 anon / 20 auth) into the page; hydrate filters + load-more on
top. *Files:* `tenders/index.astro`, reuse `api/tenders/search.ts`. *Why:* fixes the biggest SEO
miss **and** LCP in one change (covers SEO report P0 + Performance P0).

## Phase 2 — Browse experience (what users touch daily)
**2.1 Win-ring on the browse cards** — *M* — `tenders/index.astro renderCard()`. Locked/blurred for anon (signup driver). Reuse the detail-page ring.
**2.2 44px filter controls + bottom-sheet + active-filter chips** — *M* — adopt the existing `.input/.select`; collapse filters into a sheet < 640px.
**2.3 Skeleton loading** — *S* — replace the spinner with 4–6 sized skeleton cards (kills layout shift).
**2.4 Decision fields on cards** — *M* — value / B-BBEE / CSD / closing-soon urgency pill. *Files:* `renderCard`, ensure `search.ts` returns the fields.
**2.5 Debounced live search** — *S*.

## Phase 3 — Discoverability & speed
**3.1 JSON-LD structured data on detail pages** — *M* — wire `StructuredData.astro` into `tenders/t/[id].astro` (rich results + AI-answer citations).
**3.2 Interlink + sitemap the province×sector landing pages** — *S* — verify `seoGenerator.js` / `sitemap.xml.ts` cover them with fresh `lastmod`.
**3.3 Trim font weights + preload** — *S* — drop to 3 Inter weights, preload primary, keep `display=swap`.
**3.4 Defer React islands / lazy-load below-the-fold cards** — *S*.

## Phase 4 — Accessibility & trust
**4.1 Contrast audit** — *S* — verify `--txt-tertiary` and amber-on-navy meet WCAG AA; bump if not.
**4.2 Visible focus states** across cards, filters, sheet, admin queue — *S*.
**4.3 Win-ring text alternative** — *S* — `aria-label` the ring, `aria-hidden` the visual.
**4.4 Reframe the Treasury disclaimer + per-tender source stamp** — *S* — "Independent · source: eTenders · last checked {time}".

## Phase 5 — Win-Probability polish (remaining review items)
**5.1 R2 — lead with the band, shrink the %** — *S* — `tenders/t/[id].astro` panel; reduces false-precision risk.
**5.2 R5 — make migrations re-runnable/guarded** — *S* — document/guard the `ALTER` adds; confirm the migration runner records applied files.
**5.3 R8 — kill the fetch waterfall for authed users** — *M* — compute win-score server-side in the detail page for signed-in users.
**5.4 R9/R10/R11 — rate-limit the AI endpoints · cache-staleness on profile edit · numeric-coerce `win.score` in the panel** — *S*.
**5.5 R12 — local-D1 integration tests** of the endpoints — *M* — covers the DB/auth/model wiring the pure tests can't.
**5.6 R13 — CIDB suffix parsing** (e.g. `7CEPE`) — surface "unread CIDB requirement" instead of silently skipping — *S*.
**5.7 R14 — re-init panels on `astro:page-load`** if you adopt View Transitions — *S*.

---

## Suggested sequencing
1. **Phase 1** (1.1 then 1.2) — biggest leverage; unblocks the rest.
2. **Phase 2** in order (2.1 → 2.5) — the daily-use payoff.
3. **Phase 3** — ride on the Phase-1 SSR work.
4. **Phases 4 & 5** — polish + de-risk before heavy marketing.

## How to execute each
Commit the project `CLAUDE.md`, then per item: `/plan-design-review` or `/cso` as relevant →
implement against the design tokens → `/review` + `/codex` → `/qa` → ship. Or hand the item to an
LLM with the universal prompt; the `CLAUDE.md` guardrails (POPIA, tokens, 44px, no `--color-amber`)
travel with it automatically.

## Rough total
~3 S + a handful of M + two L. Realistically **2–3 focused weeks** solo, or faster with the gstack
review/QA loop. Phase 1 alone is the highest-value week.
