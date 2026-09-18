/**
 * City of Ekurhuleni open tenders — public WordPress archive.
 * GET https://www.ekurhuleni.gov.za/category/business/tenders/
 */

import type { BaseAdapter, RawTender } from './base.js';

export const EKURHULENI_SOURCE_ID = 'ekurhuleni';
export const EKURHULENI_LIST_URL = 'https://www.ekurhuleni.gov.za/category/business/tenders/';

const MONTHS: Record<string, string> = {
  january: '01', february: '02', march: '03', april: '04', may: '05', june: '06',
  july: '07', august: '08', september: '09', october: '10', november: '11', december: '12',
};

export function stripHtml(s: string): string {
  return String(s ?? '')
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

export function mapEkurhuleniArticle(html: string): RawTender | null {
  const text = stripHtml(html);
  const refM = text.match(/\b((?:A|PS|GEQ|KEQ)[-\w.]+\d{2,4}[-\w.]*)\b/i);
  const ref = refM?.[1] ?? '';
  const descM = text.match(/Description:\s*(.+?)(?:\s+Bid closing|$)/i);
  const title = (descM?.[1] ?? text).slice(0, 300).trim();
  if (!title || title.length < 12) return null;
  const closeM = text.match(/Bid closing date:\s*(\d{1,2}\s+[A-Za-z]+\s+\d{4})/i);
  return {
    sourceId: EKURHULENI_SOURCE_ID,
    externalId: (ref || title).replace(/\s+/g, '-').slice(0, 80),
    title: (ref ? `${ref}: ${title}` : title).slice(0, 300),
    description: title.slice(0, 500),
    buyer: 'City of Ekurhuleni',
    province: 'gauteng',
    sector: 'consulting',
    status: 'active',
    closingDate: closeM ? parseLongDate(closeM[1]) : parseLongDate(text),
    openingDate: null,
    value: null,
    currency: 'ZAR',
    procurementMethod: null,
    documentUrls: [EKURHULENI_LIST_URL],
    sourceUrl: EKURHULENI_LIST_URL,
    rawJson: '',
  };
}

export function parseEkurhuleniHtml(html: string): RawTender[] {
  const arts = String(html ?? '').match(/<article[\s\S]*?<\/article>/gi) ?? [];
  const out: RawTender[] = [];
  const seen = new Set<string>();
  for (const art of arts) {
    const mapped = mapEkurhuleniArticle(art);
    if (!mapped || seen.has(mapped.externalId)) continue;
    seen.add(mapped.externalId);
    out.push(mapped);
  }
  return out;
}

export class EkurhuleniAdapter implements BaseAdapter {
  sourceId = EKURHULENI_SOURCE_ID;

  async fetch(): Promise<RawTender[]> {
    const res = await fetch(EKURHULENI_LIST_URL, {
      headers: {
        Accept: 'text/html',
        'User-Agent': 'Tenderpreneurs/1.0 (+https://tenderpreneurs.co.za)',
      },
    });
    if (!res.ok) throw new Error(`Ekurhuleni HTTP ${res.status}`);
    return parseEkurhuleniHtml(await res.text());
  }
}
