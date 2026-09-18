/**
 * SANRAL adapter — public DataTables JSON on nra.co.za.
 * Listing: GET /sanral-tenders/list/open-tenders
 * sourceId must stay `sanral` to match the D1 sources row.
 */

import type { BaseAdapter, RawTender } from './base.js';

export const SANRAL_SOURCE_ID = 'sanral';
export const SANRAL_LIST_URL = 'https://www.nra.co.za/sanral-tenders/list/open-tenders';
const PAGE_SIZE = 50;
const MAX_PAGES = 3;

const PROVINCE_MAP: Record<string, string> = {
  'Eastern Cape': 'eastern-cape',
  'Free State': 'free-state',
  'Gauteng': 'gauteng',
  'KwaZulu-Natal': 'kwazulu-natal',
  'Limpopo': 'limpopo',
  'Mpumalanga': 'mpumalanga',
  'North West': 'north-west',
  'Northern Cape': 'northern-cape',
  'Western Cape': 'western-cape',
  National: 'national',
};

export function stripHtml(s: string): string {
  return String(s ?? '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

export function parseSanralDate(raw: string): string | null {
  const m = String(raw ?? '').match(/(\d{4})[/-](\d{2})[/-](\d{2})/);
  if (!m) return null;
  return `${m[1]}-${m[2]}-${m[3]}`;
}

export function parseSanralHref(html: string): { href: string; ref: string } | null {
  const m = String(html ?? '').match(/href="([^"]+)"[^>]*>([^<]+)</i);
  if (!m) {
    const text = stripHtml(html);
    return text ? { href: '', ref: text } : null;
  }
  return { href: m[1].replace(/&amp;/g, '&'), ref: stripHtml(m[2]) };
}

function mapSector(category: string): string {
  const lower = category.toLowerCase();
  if (lower.includes('construct') || lower.includes('works') || lower.includes('road')) return 'construction';
  if (lower.includes('consult') || lower.includes('profession')) return 'consulting';
  return 'construction';
}

export function mapSanralRow(cells: string[]): RawTender | null {
  if (!Array.isArray(cells) || cells.length < 3) return null;
  const parsed = parseSanralHref(cells[0] ?? '');
  if (!parsed?.ref) return null;

  const category = stripHtml(cells[1] ?? '');
  const region = stripHtml(cells[2] ?? '');
  const description = stripHtml(cells[3] ?? '').slice(0, 500);
  const contactEmail = stripHtml(cells[4] ?? '') || null;
  const closingDate = parseSanralDate(stripHtml(cells[5] ?? ''));
  const path = parsed.href.startsWith('http')
    ? parsed.href
    : `https://www.nra.co.za${parsed.href.startsWith('/') ? '' : '/'}${parsed.href}`;
  const slug = parsed.href.split('/').filter(Boolean).pop() || parsed.ref;

  return {
    sourceId: SANRAL_SOURCE_ID,
    externalId: slug,
    title: parsed.ref.slice(0, 300),
    description: description || `${category} — ${region}`.trim(),
    buyer: 'SANRAL',
    province: PROVINCE_MAP[region] ?? 'national',
    sector: mapSector(category),
    status: 'active',
    closingDate,
    openingDate: null,
    value: null,
    currency: 'ZAR',
    procurementMethod: null,
    documentUrls: parsed.href ? [path] : [],
    sourceUrl: parsed.href ? path : 'https://www.nra.co.za/sanral-tenders/status',
    rawJson: '',
    contactEmail,
  };
}

export function parseSanralList(payload: { tenders?: unknown }): RawTender[] {
  const rows = Array.isArray(payload?.tenders) ? payload.tenders : [];
  const out: RawTender[] = [];
  for (const row of rows) {
    if (!Array.isArray(row)) continue;
    const mapped = mapSanralRow(row.map((c) => String(c ?? '')));
    if (mapped) out.push(mapped);
  }
  return out;
}

export class SanralAdapter implements BaseAdapter {
  sourceId = SANRAL_SOURCE_ID;

  async fetch(): Promise<RawTender[]> {
    const all: RawTender[] = [];
    const seen = new Set<string>();

    for (let page = 1; page <= MAX_PAGES; page++) {
      const url =
        `${SANRAL_LIST_URL}?pageSize=${PAGE_SIZE}&pageIndex=${page}` +
        `&region_id=1&search=&init=${page === 1 ? 1 : 0}`;
      const res = await fetch(url, {
        headers: {
          Accept: 'application/json',
          'X-Requested-With': 'XMLHttpRequest',
          'User-Agent': 'Tenderpreneurs/1.0 (+https://tenderpreneurs.co.za)',
        },
      });
      if (!res.ok) {
        throw new Error(`SANRAL HTTP ${res.status} on page ${page}`);
      }
      const payload = (await res.json()) as { tenders?: unknown };
      const batch = parseSanralList(payload);
      if (batch.length === 0) break;
      for (const t of batch) {
        if (seen.has(t.externalId)) continue;
        seen.add(t.externalId);
        all.push(t);
      }
      if (batch.length < PAGE_SIZE) break;
    }

    return all;
  }
}
