/**
 * eTenders OCDS API Adapter
 *
 * Uses the official National Treasury OCDS API at https://ocds-api.etenders.gov.za
 * instead of scraping HTML (which caused 128MB memory limit exceeded errors).
 *
 * Endpoint: GET /api/OCDSReleases?PageNumber=N&PageSize=50&dateFrom=YYYY-MM-DD&dateTo=YYYY-MM-DD
 *
 * Key safety rules:
 *  1. Always check Content-Type BEFORE reading body — an HTML error page will OOM the worker
 *  2. Never use response.text() on an unknown response — always check headers first
 *  3. Use streaming-safe fetch (response.json() only after Content-Type verified as JSON)
 */

import type { BaseAdapter, RawTender } from './base.js';

const OCDS_BASE = 'https://ocds-api.etenders.gov.za';
const SOURCE_ID = 'etenders';
const PAGE_SIZE = 50;
/** How many days back to look on each ingestion run */
const LOOKBACK_DAYS = 90;
/** Safety cap — never fetch more than this many pages per run (avoids runaway loops) */
const MAX_PAGES = 20;

/** Map eTenders province strings to our canonical province keys */
const PROVINCE_MAP: Record<string, string> = {
  'Eastern Cape': 'eastern-cape',
  'Free State': 'free-state',
  Gauteng: 'gauteng',
  'KwaZulu-Natal': 'kwazulu-natal',
  Limpopo: 'limpopo',
  Mpumalanga: 'mpumalanga',
  'North West': 'north-west',
  'Northern Cape': 'northern-cape',
  'Western Cape': 'western-cape',
  National: 'national',
};

function toDateString(d: Date): string {
  return d.toISOString().split('T')[0]; // YYYY-MM-DD
}

function daysAgo(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}

/**
 * Fetch JSON from the OCDS API with safety checks.
 * Returns null if the response is not JSON (e.g. an HTML error page) — never throws on bad Content-Type.
 */
async function fetchOcdsJson(url: string): Promise<unknown | null> {
  const res = await fetch(url, {
    headers: {
      Accept: 'application/json',
      'User-Agent': 'Tenderpreneurs/1.0 (+https://tenderpreneurs.co.za)',
    },
    // Cloudflare Workers don't support AbortSignal timeout on outbound fetches,
    // but we keep the option available for local development.
  });

  if (!res.ok) {
    console.error(`[etenders] HTTP ${res.status} from ${url}`);
    return null;
  }

  const ct = res.headers.get('content-type') ?? '';
  if (!ct.includes('application/json')) {
    console.error(`[etenders] Non-JSON Content-Type "${ct}" from ${url} — skipping body read`);
    // Consume the body so the connection is released, but DON'T parse it
    await res.body?.cancel();
    return null;
  }

  return res.json();
}

interface OcdsRelease {
  ocid: string;
  id: string;
  date?: string;
  tender?: {
    id?: string;
    title?: string;
    status?: string;
    category?: string;
    province?: string;
    deliveryLocation?: string;
    description?: string;
    mainProcurementCategory?: string;
    value?: { amount?: number; currency?: string };
    documents?: Array<{ id?: string; title?: string; url?: string }>;
    tenderPeriod?: { startDate?: string; endDate?: string };
    procuringEntity?: { id?: string; name?: string };
    procurementMethod?: string;
    briefingSession?: {
      isSession?: boolean;
      compulsory?: boolean;
      date?: string;
      venue?: string;
    };
    contactPerson?: { name?: string; email?: string; telephoneNumber?: string };
  };
  buyer?: { id?: string; name?: string };
}

interface OcdsPage {
  releases?: OcdsRelease[];
  links?: { next?: string };
}

function mapRelease(release: OcdsRelease): RawTender | null {
  const t = release.tender;
  if (!t || !t.title) return null; // skip releases without tender data

  const province = t.province ? (PROVINCE_MAP[t.province] ?? 'national') : 'national';
  const buyer = t.procuringEntity?.name ?? release.buyer?.name ?? 'Unknown';
  const closingDate = t.tenderPeriod?.endDate ?? null;
  const openingDate = t.tenderPeriod?.startDate ?? release.date ?? null;
  const value = t.value?.amount && t.value.amount > 0 ? t.value.amount : null;

  return {
    sourceId: SOURCE_ID,
    externalId: release.ocid,           // globally unique OCDS ID
    title: t.title,
    description: t.description ?? '',
    buyer,
    province,
    sector: t.category ?? t.mainProcurementCategory ?? 'General',
    status: t.status ?? 'active',
    closingDate,
    openingDate,
    value,
    currency: t.value?.currency ?? 'ZAR',
    procurementMethod: t.procurementMethod ?? null,
    documentUrls: (t.documents ?? []).map((d) => d.url).filter(Boolean) as string[],
    sourceUrl: `https://www.etenders.gov.za/home/TenderDetails?tenderID=${t.id}`,
    rawJson: JSON.stringify(release),
    // Extra metadata stored as JSON in rawJson, surfaced here for classify/extract
    contactName: t.contactPerson?.name ?? null,
    contactEmail: t.contactPerson?.email ?? null,
    contactPhone: t.contactPerson?.telephoneNumber ?? null,
    briefingDate: t.briefingSession?.isSession ? (t.briefingSession.date ?? null) : null,
    briefingVenue: t.briefingSession?.isSession ? (t.briefingSession.venue ?? null) : null,
    briefingCompulsory: t.briefingSession?.compulsory ?? false,
  } as RawTender;
}

export class ETendersAdapter implements BaseAdapter {
  sourceId = SOURCE_ID;

  async fetch(): Promise<RawTender[]> {
    const dateFrom = toDateString(daysAgo(LOOKBACK_DAYS));
    const dateTo = toDateString(new Date());

    const firstUrl =
      `${OCDS_BASE}/api/OCDSReleases` +
      `?PageNumber=1&PageSize=${PAGE_SIZE}&dateFrom=${dateFrom}&dateTo=${dateTo}`;

    console.log(`[etenders] Fetching OCDS releases from ${dateFrom} to ${dateTo}`);

    const results: RawTender[] = [];
    let nextUrl: string | null = firstUrl;
    let pageNum = 0;

    while (nextUrl && pageNum < MAX_PAGES) {
      pageNum++;
      console.log(`[etenders] Page ${pageNum}: ${nextUrl}`);

      const page = (await fetchOcdsJson(nextUrl)) as OcdsPage | null;
      if (!page) {
        console.error(`[etenders] Null response on page ${pageNum}, stopping`);
        break;
      }

      const releases = page.releases ?? [];
      console.log(`[etenders] Page ${pageNum}: ${releases.length} releases`);

      for (const release of releases) {
        const mapped = mapRelease(release);
        if (mapped) results.push(mapped);
      }

      // Follow pagination — but ONLY if it's a different URL to prevent infinite loops
      const nextLink = page.links?.next ?? null;
      if (nextLink && nextLink !== nextUrl) {
        nextUrl = nextLink;
      } else {
        nextUrl = null; // done
      }
    }

    console.log(`[etenders] Total mapped tenders: ${results.length}`);
    return results;
  }
}
