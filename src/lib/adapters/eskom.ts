/**
 * Eskom Tender Bulletin — public Lookup JSON.
 * GET https://tenderbulletin.eskom.co.za/webapi/api/Lookup/GetTender?TENDER_ID=
 * sourceId must stay `eskom` to match the D1 sources row.
 */

import type { BaseAdapter, RawTender } from './base.js';

export const ESKOM_SOURCE_ID = 'eskom';
export const ESKOM_LIST_URL =
  'https://tenderbulletin.eskom.co.za/webapi/api/Lookup/GetTender?TENDER_ID=';
const MAX_ITEMS = 400;

const PROVINCE_MAP: Record<string, string> = {
  'Western Cape': 'western-cape',
  'Northern Cape': 'northern-cape',
  'Eastern Cape': 'eastern-cape',
  'Free State': 'free-state',
  'Kwa-Zulu Natal': 'kwazulu-natal',
  Gauteng: 'gauteng',
  'North West': 'north-west',
  Mpumalanga: 'mpumalanga',
  Northern: 'limpopo',
  National: 'national',
  'Not Selected': 'national',
};

export function parseIsoDate(raw: unknown): string | null {
  const m = String(raw ?? '').match(/(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

function isCancelled(text: string): boolean {
  const t = text.toLowerCase();
  return t.includes('cancel') || t.includes('regret');
}

function mapSector(division: string, header: string): string {
  const hay = `${division} ${header}`.toLowerCase();
  if (hay.includes('construct') || hay.includes('civil') || hay.includes('works')) return 'construction';
  if (hay.includes('ict') || hay.includes('it ') || hay.includes('software')) return 'ict';
  if (hay.includes('security') || hay.includes('guard')) return 'security';
  if (hay.includes('consult') || hay.includes('advisor') || hay.includes('professional')) return 'consulting';
  if (hay.includes('clean')) return 'cleaning';
  return 'energy';
}

export function mapEskomRow(row: Record<string, unknown>): RawTender | null {
  const id = row.TENDER_ID;
  const header = String(row.HEADER_DESC ?? '').replace(/\s+/g, ' ').trim();
  const reference = String(row.REFERENCE ?? '').trim();
  if (!id || !header) return null;
  if (isCancelled(header) || isCancelled(reference)) return null;

  const provinceName = String(row.Province ?? '');
  const email = String(row.EMAIL ?? '').trim();
  const closingDate = parseIsoDate(row.CLOSING_DATE);
  const openingDate = parseIsoDate(row.PUBLISHEDDATE);

  return {
    sourceId: ESKOM_SOURCE_ID,
    externalId: String(id),
    title: (reference ? `${reference}: ${header}` : header).slice(0, 300),
    description: String(row.SCOPE_DETAILS ?? header).replace(/\s+/g, ' ').trim().slice(0, 500),
    buyer: 'Eskom',
    province: PROVINCE_MAP[provinceName] ?? 'national',
    sector: mapSector(String(row.DESCRIPTION ?? ''), header),
    status: 'active',
    closingDate,
    openingDate,
    value: null,
    currency: 'ZAR',
    procurementMethod: null,
    documentUrls: [`https://tenderbulletin.eskom.co.za/tender/${id}`],
    sourceUrl: `https://tenderbulletin.eskom.co.za/tender/${id}`,
    rawJson: '',
    contactEmail: email.includes('@') ? email : null,
  };
}

export function parseEskomList(payload: unknown): RawTender[] {
  const rows = Array.isArray(payload) ? payload : [];
  const out: RawTender[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    if (!row || typeof row !== 'object') continue;
    const mapped = mapEskomRow(row as Record<string, unknown>);
    if (!mapped || seen.has(mapped.externalId)) continue;
    seen.add(mapped.externalId);
    out.push(mapped);
  }
  out.sort((a, b) => (a.closingDate ?? '9999').localeCompare(b.closingDate ?? '9999'));
  return out.slice(0, MAX_ITEMS);
}

export class EskomAdapter implements BaseAdapter {
  sourceId = ESKOM_SOURCE_ID;

  async fetch(): Promise<RawTender[]> {
    const res = await fetch(ESKOM_LIST_URL, {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'Tenderpreneurs/1.0 (+https://tenderpreneurs.co.za)',
      },
    });
    if (!res.ok) throw new Error(`Eskom HTTP ${res.status}`);
    return parseEskomList(await res.json());
  }
}
