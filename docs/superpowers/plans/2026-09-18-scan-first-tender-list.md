# Scan-first public tender list

Approved direction: option A (scan-first public `/tenders`).

## Files

- `src/lib/tender-display.ts` — title fallback, urgency, value, guest cap
- `tests/unit/tender-display.test.ts` — unit coverage for those helpers
- `src/pages/tenders/index.astro` — dense title-first rows, 20 guest rows, closes-within filter
- `src/pages/api/tenders/search.ts` — guest cap 20, `within` filter, search description
- `package.json` — `test:unit`

## Checks

- `npm run test:unit`
- Guest list is 20 rows, then the existing sign-in gate
- Bid-number titles fall back to description sentence
- Closing chip includes time when present
- Empty filter state offers Clear filters
