/**
 * City of Cape Town Procurement Administration Portal — public HTML table.
 * GET https://web1.capetown.gov.za/web1/tenderportal/Tender
 * sourceId must stay `cct` to match the D1 sources row.
 */

import type { BaseAdapter, RawTender } from './base.js';

export const CCT_SOURCE_ID = 'cct';
export const CCT_LIST_URL = 'https://web1.capetown.gov.za/web1/tenderportal/Tender';

const SECTOR_MAP: Record<string, string> = {
  ENERGY: 'energy',
  'SAFETY AND SECURITY': 'security',
  'WATER AND SANITATION': 'construction',
  'URBAN MOBILITY': 'transport',
  'HUMAN SETTLEMENTS': 'construction',
  'URBAN WASTE MANAGEMENT': 'cleaning',
  FINANCE: 'consulting',
  'CORPORATE SERVICES': 'consulting',
  'SPATIAL PLANNING AND ENVIRONMENT': 'consulting',
  COMMUNITY: 'consulting',
};

export function stripHtml(s: string): string {
  return String(s ?? '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

export function parseIsoDate(raw: string): string | null {
  const m = String(raw ?? '').match(/(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

export function parseCctRow(cells: string[]): RawTender | null {
  if (!Array.isArray(cells) || cells.length < 5) return null;
  const number = stripHtml(cells[0] ?? '');
  const description = stripHtml(cells[1] ?? '');
  if (!number || !description) return null;
  const directorate = stripHtml(cells[2] ?? '');
  const department = stripHtml(cells[3] ?? '');
  const closingDate = parseIsoDate(cells[4] ?? '');

  return {
    sourceId: CCT_SOURCE_ID,
    externalId: number.replace(/\s+/g, ''),
    title: `${number}: ${description}`.slice(0, 300),
    description: `${description}${department ? ` — ${department}` : ''}`.slice(0, 500),
    buyer: 'City of Cape Town',
    province: 'western-cape',
    sector: SECTOR_MAP[directorate.toUpperCase()] ?? 'consulting',
    status: 'active',
    closingDate,
    openingDate: parseIsoDate(cells[6] ?? ''),
    value: null,
    currency: 'ZAR',
    procurementMethod: null,
    documentUrls: [CCT_LIST_URL],
    sourceUrl: CCT_LIST_URL,
    rawJson: '',
  };
}

export function parseCctHtml(html: string): RawTender[] {
  const rows = String(html ?? '').match(/<tr class="gridDetails">[\s\S]*?<\/tr>/gi) ?? [];
  const out: RawTender[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    const tds = row.match(/<td[^>]*>[\s\S]*?<\/td>/gi) ?? [];
    const cells = tds.map((td) => stripHtml(td));
    const mapped = parseCctRow(cells);
    if (!mapped || seen.has(mapped.externalId)) continue;
    seen.add(mapped.externalId);
    out.push(mapped);
  }
  return out;
}

export class CctAdapter implements BaseAdapter {
  sourceId = CCT_SOURCE_ID;

  async fetch(): Promise<RawTender[]> {
    const res = await fetch(CCT_LIST_URL, {
      headers: {
        Accept: 'text/html',
        'User-Agent': 'Tenderpreneurs/1.0 (+https://tenderpreneurs.co.za)',
      },
    });
    if (!res.ok) throw new Error(`Cape Town HTTP ${res.status}`);
    return parseCctHtml(await res.text());
  }
}
