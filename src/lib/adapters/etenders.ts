/**
 * eTenders OCDS API Adapter
 *
 * Memory-safe version:
 * - Hard 4MB response size cap before JSON.parse
 * - Content-Type check before reading body
 * - Page size reduced to 20 to stay well under Worker memory limits
 * - Max 10 pages per run (200 tenders) — enough for daily delta, safe on memory
 */

import type { BaseAdapter, RawTender } from './base.js';

const OCDS_BASE = 'https://ocds-api.etenders.gov.za';
const SOURCE_ID = 'etenders';
const PAGE_SIZE = 20;           // reduced from 50 — each release can be large
const LOOKBACK_DAYS = 30;       // reduced from 90 — daily runs only need recent delta
const MAX_PAGES = 10;
const MAX_RESPONSE_BYTES = 4 * 1024 * 1024; // 4MB hard cap per page response

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
  'National': 'national',
};

// Map OCDS category strings to our 12 sector slugs
const SECTOR_MAP: Record<string, string> = {
  'construction': 'construction',
  'works': 'construction',
  'infrastructure': 'construction',
  'ict': 'ict',
  'information': 'ict',
  'technology': 'ict',
  'health': 'health',
  'healthcare': 'health',
  'medical': 'health',
  'education': 'education',
  'training': 'education',
  'transport': 'transport',
  'logistics': 'transport',
  'agriculture': 'agriculture',
  'farming': 'agriculture',
  'energy': 'energy',
  'electricity': 'energy',
  'security': 'security',
  'guard': 'security',
  'consulting': 'consulting',
  'advisory': 'consulting',
  'cleaning': 'cleaning',
  'hygiene': 'cleaning',
  'catering': 'catering',
  'food': 'catering',
  'legal': 'legal',
  'law': 'legal',
};

function toDateString(d: Date): string {
  return d.toISOString().split('T')[0];
}

function daysAgo(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}

function mapSector(category?: string): string {
  if (!category) return 'consulting';
  const lower = category.toLowerCase();
  for (const [key, val] of Object.entries(SECTOR_MAP)) {
    if (lower.includes(key)) return val;
  }
  return 'consulting'; // default
}

/**
 * Memory-safe fetch: checks Content-Type, then reads body with a size cap.
 * Returns null on any error rather than throwing — the adapter loop handles nulls.
 */
async function fetchOcdsPage(url: string): Promise<unknown | null> {
  let res: Response;
  try {
    res = await fetch(url, {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'Tenderpreneurs/1.0 (+https://tenderpreneurs.co.za)',
      },
    });
  } catch (err) {
    console.error(`[etenders] fetch error: ${err}`);
    return null;
  }

  if (!res.ok) {
    console.error(`[etenders] HTTP ${res.status} from ${url}`);
    await res.body?.cancel();
    return null;
  }

  const ct = res.headers.get('content-type') ?? '';
  if (!ct.includes('application/json')) {
    console.error(`[etenders] Non-JSON Content-Type "${ct}" — skipping`);
    await res.body?.cancel();
    return null;
  }

  // Read with size cap — prevents OOM on unexpectedly large responses
  const reader = res.body?.getReader();
  if (!reader) return null;

  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      totalBytes += value.byteLength;
      if (totalBytes > MAX_RESPONSE_BYTES) {
        console.error(`[etenders] Response exceeded ${MAX_RESPONSE_BYTES} bytes — aborting page`);
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }
  }

  const combined = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.byteLength;
  }

  try {
    return JSON.parse(new TextDecoder().decode(combined));
  } catch (err) {
    console.error(`[etenders] JSON parse error: ${err}`);
    return null;
  }
}

interface OcdsRelease {
  ocid: string;
  id?: string;
  date?: string;
  tender?: {
    id?: string;
    title?: string;
    status?: string;
    category?: string;
    province?: string;
    description?: string;
    mainProcurementCategory?: string;
    value?: { amount?: number; currency?: string };
    documents?: Array<{ url?: string }>;
    tenderPeriod?: { startDate?: string; endDate?: string };
    procuringEntity?: { name?: string };
    procurementMethod?: string;
    briefingSession?: {
      isSession?: boolean;
      compulsory?: boolean;
      date?: string;
      venue?: string;
    };
    contactPerson?: { name?: string; email?: string; telephoneNumber?: string };
  };
  buyer?: { name?: string };
}

interface OcdsPage {
  releases?: OcdsRelease[];
  links?: { next?: string };
}

function mapRelease(release: OcdsRelease): RawTender | null {
  const t = release.tender;
  if (!t?.title) return null;

  const province = t.province
    ? (PROVINCE_MAP[t.province] ?? 'national')
    : 'national';

  const sector = mapSector(t.category ?? t.mainProcurementCategory);
  const buyer = t.procuringEntity?.name ?? release.buyer?.name ?? 'Unknown';
  const closingDate = t.tenderPeriod?.endDate
    ? t.tenderPeriod.endDate.split('T')[0]
    : null;
  const openingDate = t.tenderPeriod?.startDate
    ? t.tenderPeriod.startDate.split('T')[0]
    : (release.date ? release.date.split('T')[0] : null);

  return {
    sourceId: SOURCE_ID,
    externalId: release.ocid,
    title: t.title,
    description: t.description ?? '',
    buyer,
    province,
    sector,
    status: t.status === 'active' ? 'active' : (t.status ?? 'active'),
    closingDate,
    openingDate,
    value: t.value?.amount ?? null,
    currency: t.value?.currency ?? 'ZAR',
    procurementMethod: t.procurementMethod ?? null,
    documentUrls: (t.documents ?? [])
      .map(d => d.url)
      .filter((u): u is string => !!u),
    sourceUrl: `https://www.etenders.gov.za/home/TenderDetails?tenderID=${t.id ?? ''}`,
    rawJson: '',        // intentionally empty — saves memory, raw data in D1 not needed
    briefingDate: t.briefingSession?.isSession ? (t.briefingSession.date?.split('T')[0] ?? null) : null,
    briefingVenue: t.briefingSession?.isSession ? (t.briefingSession.venue ?? null) : null,
    briefingCompulsory: t.briefingSession?.compulsory ?? false,
    contactName: t.contactPerson?.name ?? null,
    contactEmail: t.contactPerson?.email ?? null,
    contactPhone: t.contactPerson?.telephoneNumber ?? null,
  } as RawTender;
}

export class ETendersAdapter implements BaseAdapter {
  sourceId = SOURCE_ID;

  async fetch(): Promise<RawTender[]> {
    const dateFrom = toDateString(daysAgo(LOOKBACK_DAYS));
    const dateTo = toDateString(new Date());

    const firstUrl =
      `${OCDS_BASE}/api/OCDSReleases` +
      `?PageNumber=1&PageSize=${PAGE_SIZE}` +
      `&dateFrom=${dateFrom}&dateTo=${dateTo}`;

    console.log(`[etenders] Fetching OCDS releases ${dateFrom} → ${dateTo}`);

    const results: RawTender[] = [];
    let nextUrl: string | null = firstUrl;
    let pageNum = 0;

    while (nextUrl && pageNum < MAX_PAGES) {
      pageNum++;
      console.log(`[etenders] Page ${pageNum}: ${nextUrl}`);

      const page = (await fetchOcdsPage(nextUrl)) as OcdsPage | null;
      if (!page) break;

      const releases = page.releases ?? [];
      console.log(`[etenders] Page ${pageNum}: ${releases.length} releases`);
      if (releases.length === 0) break;

      for (const release of releases) {
        const mapped = mapRelease(release);
        if (mapped) results.push(mapped);
      }

      const nextLink = page.links?.next ?? null;
      nextUrl = (nextLink && nextLink !== nextUrl) ? nextLink : null;
    }

    console.log(`[etenders] Total mapped: ${results.length}`);
    return results;
  }
}
