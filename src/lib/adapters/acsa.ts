/**
 * ACSA Tender Bulletin — public SharePoint list.
 * GET https://www.airports.co.za/business/supply-chain-management/current-and-future-tenders
 */

import type { BaseAdapter, RawTender } from './base.js';

export const ACSA_SOURCE_ID = 'acsa';
export const ACSA_LIST_URL =
  'https://www.airports.co.za/business/supply-chain-management/current-and-future-tenders';

export function stripHtml(s: string): string {
  return String(s ?? '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/\u200b/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function parseUsDate(raw: string): string | null {
  const m = String(raw ?? '').match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (!m) return null;
  return `${m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`;
}

function mapSector(category: string): string {
  const t = category.toLowerCase();
  if (t.includes('security')) return 'security';
  if (t.includes('ict') || t.includes('it ')) return 'ict';
  if (t.includes('construct') || t.includes('project') || t.includes('civil')) return 'construction';
  if (t.includes('clean') || t.includes('sweep')) return 'cleaning';
  return 'transport';
}

export function mapAcsaRow(cells: string[]): RawTender | null {
  if (cells.length < 5) return null;
  const airport = stripHtml(cells[0] ?? '');
  const category = stripHtml(cells[1] ?? '');
  const title = stripHtml(cells[2] ?? '');
  const closingDate = parseUsDate(cells[4] ?? '');
  if (!title || title.length < 8) return null;
  if (closingDate && closingDate < '2026-01-01') return null;

  const ref = stripHtml(cells[5] ?? '').slice(0, 80) || title.slice(0, 40);
  return {
    sourceId: ACSA_SOURCE_ID,
    externalId: ref.replace(/\s+/g, '-').slice(0, 80),
    title: title.slice(0, 300),
    description: `${airport} — ${category} — ${title}`.slice(0, 500),
    buyer: 'Airports Company South Africa',
    province: 'national',
    sector: mapSector(`${category} ${title}`),
    status: 'active',
    closingDate,
    openingDate: parseUsDate(cells[3] ?? ''),
    value: null,
    currency: 'ZAR',
    procurementMethod: null,
    documentUrls: [ACSA_LIST_URL],
    sourceUrl: ACSA_LIST_URL,
    rawJson: '',
  };
}

export function parseAcsaHtml(html: string): RawTender[] {
  const table = String(html ?? '').match(/id="onetidDoclibViewTbl0"[\s\S]*?<\/table>/i)?.[0] ?? html;
  const rows = table.match(/<tr[^>]*>[\s\S]*?<\/tr>/gi) ?? [];
  const out: RawTender[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    const tds = row.match(/<td[^>]*>[\s\S]*?<\/td>/gi) ?? [];
    const mapped = mapAcsaRow(tds.map((td) => stripHtml(td)));
    if (!mapped || seen.has(mapped.externalId)) continue;
    seen.add(mapped.externalId);
    out.push(mapped);
  }
  return out;
}

export class AcsaAdapter implements BaseAdapter {
  sourceId = ACSA_SOURCE_ID;

  async fetch(): Promise<RawTender[]> {
    const res = await fetch(ACSA_LIST_URL, {
      headers: {
        Accept: 'text/html',
        'User-Agent': 'Tenderpreneurs/1.0 (+https://tenderpreneurs.co.za)',
      },
    });
    if (!res.ok) throw new Error(`ACSA HTTP ${res.status}`);
    return parseAcsaHtml(await res.text());
  }
}
