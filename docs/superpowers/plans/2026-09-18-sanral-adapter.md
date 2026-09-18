# SANRAL coverage slice — 2026-09-18

Approved path: B (P0-1 then one public SOE adapter).

## P0-1 evidence
- Cron ingest HTTP 200 on `a0122d3` (0 new / 0 updated = already stored).
- `/tenders` shows open rows from D1.
- D1: 2000 etenders + 55 city-cape-town. `sanral` source row exists, 0 tenders.

## Adapter
- Public JSON: `GET https://www.nra.co.za/sanral-tenders/list/open-tenders`
- Parser unit-tested against live-shaped DataTables cells.
- Cron POSTs `/api/cron/ingest?source=sanral` after eTenders.

## Out of scope
Other SOEs, login walls, SITA rfq SPA, enabling outbound email.
