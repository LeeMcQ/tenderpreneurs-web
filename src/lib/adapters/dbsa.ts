/**
 * DBSA open RFPs — public HTML table.
 * GET https://www.dbsa.org/procurement
 */

import type { BaseAdapter, RawTender } from './base.js';

export const DBSA_SOURCE_ID = 'dbsa';
export const DBSA_LIST_URL = 'https://www.dbsa.org/procurement';

const MONTHS: Record<string, string> = {
  january: '01', february: '02', march: '03', april: '04', may: '05', june: '06',
  july: '07', august: '08', september: '09', october: '10', november: '11', december: '12',
};

export function stripHtml(s: string): string {
  return String(s ?? '')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

export function parseLongDate(raw: string): string | null {
  const m = String(raw ?? '').match(/(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})/);
  if (!m) return null;
  const mm = MONTHS[m[2].toLowerCase()];
  return mm ? `${m[3]}-${mm}-${m[1].padStart(2, '0')}` : null;
}

function mapSector(title: string): string {
  const t = title.toLowerCase();
  if (t.includes('construct') || t.includes('contractor') || t.includes('civil') || t.includes('dam')) return 'construction';
  if (t.includes('ict') || t.includes('software')) return 'ict';
  if (t.includes('clean')) return 'cleaning';
  if (t.includes('legal')) return 'legal';
  return 'consulting';
}

export function mapDbsaRow(cells: string[]): RawTender | null {
  if (cells.length < 3) return null;
  const body = stripHtml(cells[0] ?? '');
  const refM = body.match(/\b(RFP|RFQ|RFR)\s*\/?\s*([A-Z0-9][A-Z0-9\/-]*)/i);
  const ref = refM ? `${refM[1].toUpperCase()} ${refM[2]}` : '';
  const title = body.replace(/^(RFP|RFQ|RFR)\s*\/?\s*[A-Z0-9][A-Z0-9\/-]*\s*:?\s*/i, '').slice(0, 300);
  if (!title || title.length < 12) return null;
  return {
    sourceId: DBSA_SOURCE_ID,
    externalId: (ref || title).replace(/\s+/g, '-').slice(0, 80),
    title: (ref ? `${ref}: ${title}` : title).slice(0, 300),
    description: body.slice(0, 500),
    buyer: 'Development Bank of Southern Africa',
    province: 'national',
    sector: mapSector(title),
    status: 'active',
    closingDate: parseLongDate(cells[2] ?? ''),
    openingDate: parseLongDate(cells[1] ?? ''),
    value: null,
    currency: 'ZAR',
    procurementMethod: null,
    documentUrls: [DBSA_LIST_URL],
    sourceUrl: DBSA_LIST_URL,
    rawJson: '',
  };
}

export function parseDbsaHtml(html: string): RawTender[] {
  const tbody = String(html ?? '').match(/<tbody[\s\S]*?<\/tbody>/i)?.[0] ?? html;
  const rows = tbody.match(/<tr[\s\S]*?<\/tr>/gi) ?? [];
  const out: RawTender[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    const tds = row.match(/<td[^>]*>[\s\S]*?<\/td>/gi) ?? [];
    const mapped = mapDbsaRow(tds.map((td) => stripHtml(td)));
    if (!mapped || seen.has(mapped.externalId)) continue;
    seen.add(mapped.externalId);
    out.push(mapped);
  }
  return out;
}

export class DbsaAdapter implements BaseAdapter {
  sourceId = DBSA_SOURCE_ID;

  async fetch(): Promise<RawTender[]> {
    const res = await fetch(DBSA_LIST_URL, {
      headers: {
        Accept: 'text/html',
        'User-Agent': 'Tenderpreneurs/1.0 (+https://tenderpreneurs.co.za)',
      },
    });
    if (!res.ok) throw new Error(`DBSA HTTP ${res.status}`);
    return parseDbsaHtml(await res.text());
  }
}
