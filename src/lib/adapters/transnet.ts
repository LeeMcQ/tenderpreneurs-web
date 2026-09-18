/**
 * Transnet advertised tenders — public JSON on the eTenders Azure site.
 * GET https://transnetetenders.azurewebsites.net/Home/GetAdvertisedTenders
 * sourceId must stay `transnet` to match the D1 sources row.
 */

import type { BaseAdapter, RawTender } from './base.js';

export const TRANSNET_SOURCE_ID = 'transnet';
export const TRANSNET_LIST_URL =
  'https://transnetetenders.azurewebsites.net/Home/GetAdvertisedTenders';

export function parseUsDate(raw: unknown): string | null {
  const m = String(raw ?? '').match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (!m) return null;
  return `${m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`;
}

function mapProvince(location: string): string {
  const t = location.toLowerCase();
  if (t.includes('cape town') || t.includes('western cape') || t.includes('saldanha')) return 'western-cape';
  if (t.includes('durban') || t.includes('richards bay') || t.includes('kzn') || t.includes('kwazulu')) return 'kwazulu-natal';
  if (t.includes('east london') || t.includes('port elizabeth') || t.includes('gqeberha') || t.includes('ngqura')) return 'eastern-cape';
  if (t.includes('gauteng') || t.includes('johannesburg') || t.includes('tshwane') || t.includes('germiston') || t.includes('city deep')) return 'gauteng';
  if (t.includes('port elizabeth')) return 'eastern-cape';
  if (t.includes('national') || t.includes('all ports') || t.includes('various')) return 'national';
  return 'national';
}

function mapSector(category: string, title: string): string {
  const hay = `${category} ${title}`.toLowerCase();
  if (hay.includes('construct') || hay.includes('civil') || hay.includes('works')) return 'construction';
  if (hay.includes('ict') || hay.includes('software') || hay.includes('it ')) return 'ict';
  if (hay.includes('consult') || hay.includes('professional') || hay.includes('advisor')) return 'consulting';
  if (hay.includes('security')) return 'security';
  return 'transport';
}

export function mapTransnetRow(row: Record<string, unknown>): RawTender | null {
  const number = String(row.tenderNumber ?? row.nameOfTender ?? '').trim();
  const description = String(row.descriptionOfTender ?? '').replace(/\s+/g, ' ').trim();
  if (!number && !description) return null;
  const status = String(row.tenderStatus ?? '').toLowerCase();
  if (status && status !== 'open') return null;

  const email = String(row.contactPersonEmailAddress ?? '').trim();
  const attachment = String(row.attachment ?? '').trim();
  const rowKey = String(row.rowKey ?? number);
  const location = String(row.locationOfService ?? '');

  return {
    sourceId: TRANSNET_SOURCE_ID,
    externalId: rowKey || number,
    title: (number || description).slice(0, 300),
    description: description.slice(0, 500),
    buyer: String(row.nameOfInstitution ?? 'Transnet').trim() || 'Transnet',
    province: mapProvince(location),
    sector: mapSector(String(row.tenderCategory ?? ''), description),
    status: 'active',
    closingDate: parseUsDate(row.closingDate),
    openingDate: parseUsDate(row.publishedDate),
    value: null,
    currency: 'ZAR',
    procurementMethod: String(row.tenderType ?? '') || null,
    documentUrls: attachment ? [attachment] : [],
    sourceUrl: attachment || TRANSNET_LIST_URL.replace('/GetAdvertisedTenders', '/AdvertisedTenders'),
    rawJson: '',
    contactName: String(row.contactPersonName ?? '').trim() || null,
    contactEmail: email.includes('@') ? email : null,
    briefingDate: parseUsDate(row.briefingDate),
  };
}

export function parseTransnetList(payload: unknown): RawTender[] {
  const rows = Array.isArray(payload)
    ? payload
    : (payload && typeof payload === 'object' && Array.isArray((payload as { result?: unknown }).result)
      ? (payload as { result: unknown[] }).result
      : []);
  const out: RawTender[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    if (!row || typeof row !== 'object') continue;
    const mapped = mapTransnetRow(row as Record<string, unknown>);
    if (!mapped || seen.has(mapped.externalId)) continue;
    seen.add(mapped.externalId);
    out.push(mapped);
  }
  return out;
}

export class TransnetAdapter implements BaseAdapter {
  sourceId = TRANSNET_SOURCE_ID;

  async fetch(): Promise<RawTender[]> {
    const res = await fetch(TRANSNET_LIST_URL, {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'Tenderpreneurs/1.0 (+https://tenderpreneurs.co.za)',
      },
    });
    if (!res.ok) throw new Error(`Transnet HTTP ${res.status}`);
    return parseTransnetList(await res.json());
  }
}
