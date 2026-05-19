/**
 * Treasury Bulletin Adapter — DISABLED
 *
 * The original URL https://www.gov.za/documents/tender-bulletin returns HTTP 404.
 *
 * The National Treasury tender data is fully covered by the eTenders OCDS API
 * (https://ocds-api.etenders.gov.za) which is already handled by ETendersAdapter.
 *
 * This adapter returns an empty array to prevent ingestion errors without
 * removing the source record from the DB (which would break FK constraints).
 *
 * TODO (future): If supplementary Treasury Gazette PDF parsing is needed,
 * point this at https://data.etenders.gov.za/Home/ReleasesFiles and parse
 * the downloadable OCDS release files.
 */

import type { BaseAdapter, RawTender } from './base.js';

export class TreasuryBulletinAdapter implements BaseAdapter {
  sourceId = 'treasury-bulletin';

  async fetch(): Promise<RawTender[]> {
    console.log(
      '[treasury-bulletin] Adapter disabled — data covered by eTenders OCDS API. Returning empty array.'
    );
    return [];
  }
}
