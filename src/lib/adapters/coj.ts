/**
 * City of Johannesburg RFQs — public SharePoint table (often entity-encoded).
 * GET https://www.joburg.org.za/work_/Pages/2026-Tenders/Request-for-Quotations.aspx
 */

import type { BaseAdapter, RawTender } from './base.js';

export const COJ_SOURCE_ID = 'coj';
export const COJ_LIST_URL =
  'https://www.joburg.org.za/work_/Pages/2026-Tenders/Request-for-Quotations.aspx';

const MONTHS: Record<string, string> = {
  january: '01', february: '02', march: '03', april: '04', may: '05', june: '06',
  july: '07', august: '08', september: '09', october: '10', november: '11', december: '12',
};

export function decodeEntities(s: string): string {
  let out = String(s ?? '');
  for (let i = 0; i < 3; i++) {
    out = out
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#58;/g, ':')
      .replace(/&amp;/g, '&')
      .replace(/&nbsp;/gi, ' ');
  }
  return out;
}

export function stripHtml(s: string): string {
  return decodeEntities(s)
    .replace(/<[^>]+>/g, ' ')
    .replace(/\u200b/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function parseLongDate(raw: string): string | null {
  const m = String(raw ?? '').match(/(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})/);
  if (!m) return null;
  const mm = MONTHS[m[2].toLowerCase()];
  return mm ? `${m[3]}-${mm}-${m[1].padStart(2, '0')}` : null;
}

export function mapCojRow(cells: string[]): RawTender | null {
  if (cells.length < 3) return null;
  const number = stripHtml(cells[0] ?? '');
  const description = stripHtml(cells[1] ?? '');
  if (!number || !description) return null;
  return {
    sourceId: COJ_SOURCE_ID,
    externalId: number.replace(/\s+/g, ''),
    title: `${number}: ${description}`.slice(0, 300),
    description: description.slice(0, 500),
    buyer: 'City of Johannesburg',
    province: 'gauteng',
    sector: 'consulting',
    status: 'active',
    closingDate: parseLongDate(cells[2] ?? ''),
    openingDate: null,
    value: null,
    currency: 'ZAR',
    procurementMethod: 'rfq',
    documentUrls: [COJ_LIST_URL],
    sourceUrl: COJ_LIST_URL,
    rawJson: '',
  };
}

export function parseCojHtml(html: string): RawTender[] {
  const decoded = decodeEntities(html);
  const rows = decoded.match(/<tr[^>]*class="[^"]*ms-rteTable[^"]*"[^>]*>[\s\S]*?<\/tr>/gi) ?? [];
  const out: RawTender[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    const tds = row.match(/<td[^>]*>[\s\S]*?<\/td>/gi) ?? [];
    const mapped = mapCojRow(tds.map((td) => stripHtml(td)));
    if (!mapped || seen.has(mapped.externalId)) continue;
    seen.add(mapped.externalId);
    out.push(mapped);
  }
  return out;
}

export class CojAdapter implements BaseAdapter {
  sourceId = COJ_SOURCE_ID;

  async fetch(): Promise<RawTender[]> {
    const res = await fetch(COJ_LIST_URL, {
      headers: {
        Accept: 'text/html',
        'User-Agent': 'Tenderpreneurs/1.0 (+https://tenderpreneurs.co.za)',
      },
    });
    if (!res.ok) throw new Error(`Johannesburg HTTP ${res.status}`);
    return parseCojHtml(await res.text());
  }
}
