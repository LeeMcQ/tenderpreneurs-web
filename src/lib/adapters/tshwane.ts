/**
 * City of Tshwane quotations — public WordPress category.
 * GET https://www.tshwane.gov.za/?cat=61
 */

import type { BaseAdapter, RawTender } from './base.js';

export const TSHWANE_SOURCE_ID = 'tshwane';
export const TSHWANE_LIST_URL = 'https://www.tshwane.gov.za/?cat=61';

const MONTHS: Record<string, string> = {
  january: '01', february: '02', march: '03', april: '04', may: '05', june: '06',
  july: '07', august: '08', september: '09', october: '10', november: '11', december: '12',
};

export function stripHtml(s: string): string {
  return String(s ?? '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&#8211;/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
}

export function parseLongDate(raw: string): string | null {
  const m = String(raw ?? '').match(/(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})/);
  if (!m) return null;
  const mm = MONTHS[m[2].toLowerCase()];
  return mm ? `${m[3]}-${mm}-${m[1].padStart(2, '0')}` : null;
}

export function mapTshwaneArticle(html: string): RawTender | null {
  const text = stripHtml(html);
  const refM = text.match(/\b(Q\d+(?:-\d+)*-\d{4}-\d{2})\b/i);
  const ref = refM?.[1] ?? '';
  const closeM = text.match(/Closing date:\s*(\d{1,2}\s+[A-Za-z]+\s+\d{4})/i);
  const titleM = text.match(/(?:RE-ADVERTISEMENT:\s*)?(ADVERTISEMENT:\s*)?(.+?)(?:\s+TENDER NUMBER:|\s+Closing date:|$)/i);
  const title = (titleM?.[2] ?? text).slice(0, 300).trim();
  if (!title || title.length < 12) return null;
  return {
    sourceId: TSHWANE_SOURCE_ID,
    externalId: (ref || title).replace(/\s+/g, '-').slice(0, 80),
    title: (ref ? `${ref}: ${title}` : title).slice(0, 300),
    description: title.slice(0, 500),
    buyer: 'City of Tshwane',
    province: 'gauteng',
    sector: 'consulting',
    status: 'active',
    closingDate: closeM ? parseLongDate(closeM[1]) : parseLongDate(text),
    openingDate: null,
    value: null,
    currency: 'ZAR',
    procurementMethod: 'rfq',
    documentUrls: [TSHWANE_LIST_URL],
    sourceUrl: TSHWANE_LIST_URL,
    rawJson: '',
  };
}

export function parseTshwaneHtml(html: string): RawTender[] {
  const arts = String(html ?? '').match(/<article[\s\S]*?<\/article>/gi) ?? [];
  const out: RawTender[] = [];
  const seen = new Set<string>();
  for (const art of arts) {
    const mapped = mapTshwaneArticle(art);
    if (!mapped || seen.has(mapped.externalId)) continue;
    seen.add(mapped.externalId);
    out.push(mapped);
  }
  return out;
}

export class TshwaneAdapter implements BaseAdapter {
  sourceId = TSHWANE_SOURCE_ID;

  async fetch(): Promise<RawTender[]> {
    const res = await fetch(TSHWANE_LIST_URL, {
      headers: {
        Accept: 'text/html',
        'User-Agent': 'Tenderpreneurs/1.0 (+https://tenderpreneurs.co.za)',
      },
    });
    if (!res.ok) throw new Error(`Tshwane HTTP ${res.status}`);
    return parseTshwaneHtml(await res.text());
  }
}
