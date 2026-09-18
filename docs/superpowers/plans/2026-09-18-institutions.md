# 20 SA procurement institutions — coverage matrix

Constraints: public lists only. No login walls, no SITA RFQ SPA, no outbound email.

## Live adapters (ingest writes D1)

| id | institution | endpoint | notes |
| --- | --- | --- | --- |
| etenders | National Treasury eTenders | OCDS API (GitHub fetch + worker) | covers national + many provincial/metro ads |
| treasury-bulletin | Treasury gazette | disabled | duplicate of OCDS |
| sanral | SANRAL | nra.co.za DataTables JSON | PR #8 |
| eskom | Eskom Tender Bulletin | Lookup/GetTender JSON (~260 after dropping cancel/regret) |
| transnet | Transnet advertised | GetAdvertisedTenders JSON (~65 Open) |
| cct | City of Cape Town | public HTML table (~33 open) |

## Seeded, not adapted this wave

Login / SPA / 403 — do not scrape:
- sita
- acsa (supplier portal)
- cidb-itender (registers.cidb.org.za 403)
- prasa (brochure site, no public list API found)

Mostly republished on eTenders — buyer-name filter later, not a second scraper:
- gp-treasury, wc-treasury, kzn-treasury, ec-treasury, fs-treasury
- lp-treasury, mp-treasury, nc-treasury, nw-treasury

Metro sites still need a public-list probe:
- coj, tshwane, ekurhuleni, ethekwini, nmbm, bcm, mangaung

## Verify after merge + Pages deploy

Dispatch Tenderpreneurs Cron → ingest, then:

```sql
SELECT source_id, COUNT(*) FROM tenders GROUP BY source_id ORDER BY 2 DESC;
```

Expect non-zero `eskom`, `transnet`, `cct` (and `sanral` once PR #8 is live).
