/** Recover fields eTenders listings omit by reading the official OCDS release. */

export type EnrichPatch = {
  description?: string;
  procuring_entity?: string;
  closing_date?: string;
  closing_time?: string;
  published_date?: string;
  briefing_date?: string;
  briefing_compulsory?: number;
  briefing_location?: string;
  contact_name?: string;
  contact_email?: string;
  contact_phone?: string;
  cidb_grade?: string;
  estimated_value?: number;
  documents_json?: string;
  submission_method?: string;
  source_url?: string;
  enrich_source?: string;
  evaluation_notes?: string;
  returnables_json?: string;
  bbbee_level?: string;
};

export type Release = {
  ocid?: string;
  date?: string;
  tender?: {
    id?: string;
    title?: string;
    description?: string;
    status?: string;
    category?: string;
    province?: string;
    deliveryLocation?: string;
    specialConditions?: string;
    procurementMethod?: string;
    procurementMethodDetails?: string;
    value?: { amount?: number; currency?: string };
    documents?: Array<{ url?: string; title?: string; description?: string }>;
    tenderPeriod?: { startDate?: string; endDate?: string };
    procuringEntity?: { name?: string };
    briefingSession?: { isSession?: boolean; compulsory?: boolean; date?: string; venue?: string };
    contactPerson?: { name?: string; email?: string; telephoneNumber?: string };
    awardCriteria?: { criteria?: Array<{ type?: string; description?: string }> };
  };
  buyer?: { name?: string };
};

const CIDB = /\b([1-9]\s?(?:GB|CE|EB|EP|ME|SW|SB|SQ|PE))\b/i;
const BBBEE = /\bB-?BBEE\s*(?:level\s*)?([1-8])\b/i;
const OCDS = 'https://ocds-api.etenders.gov.za/api/OCDSReleases';
const MAX_BYTES = 3 * 1024 * 1024;

export const STANDARD_RETURNABLES = [
  { code: 'CSD', label: 'CSD registration report' },
  { code: 'TCS', label: 'SARS tax compliance PIN' },
  { code: 'BBBEE', label: 'B-BBEE certificate or EME/QSE affidavit' },
  { code: 'CIPC', label: 'CIPC company registration' },
  { code: 'SBD1', label: 'SBD 1 Invitation to bid' },
  { code: 'SBD4', label: 'SBD 4 Declaration of interest' },
  { code: 'SBD6.1', label: 'SBD 6.1 Preference points' },
  { code: 'SBD8', label: 'SBD 8 Past SCM practices' },
  { code: 'SBD9', label: 'SBD 9 Independent bid determination' },
];

export function cidbFromText(...parts: Array<string | null | undefined>): string | null {
  const hay = parts.filter(Boolean).join(' ');
  const m = hay.match(CIDB);
  return m ? m[1].replace(/\s+/g, '').toUpperCase() : null;
}

export function clockFromIso(iso: string | null | undefined): string | null {
  if (!iso || !iso.includes('T')) return null;
  const m = iso.match(/T(\d{2}:\d{2})/);
  return m ? m[1] : null;
}

export function bbbeeFromText(...parts: Array<string | null | undefined>): string | null {
  const hay = parts.filter(Boolean).join(' ');
  const m = hay.match(BBBEE);
  return m ? `Level ${m[1]}` : null;
}

export function returnablesFromText(...parts: Array<string | null | undefined>): typeof STANDARD_RETURNABLES {
  const hay = parts.filter(Boolean).join(' ').toUpperCase();
  const named = STANDARD_RETURNABLES.filter((item) => {
    if (item.code === 'SBD6.1') return /SBD\s*6\.1|PREFERENCE POINTS/.test(hay);
    return hay.includes(item.code) || hay.includes(item.label.toUpperCase());
  });
  const rest = STANDARD_RETURNABLES.filter((item) => !named.some((e) => e.code === item.code));
  return named.length ? [...named, ...rest] : [...STANDARD_RETURNABLES];
}

function shiftDate(iso: string, days: number): string {
  const t = Date.parse(iso.slice(0, 10) + 'T12:00:00Z');
  const d = new Date(t + days * 86400000);
  return d.toISOString().slice(0, 10);
}

export function officialFetchUrl(ocid: string, published?: string | null, now = new Date()): string {
  const today = now.toISOString().slice(0, 10);
  const from = published && /^\d{4}-\d{2}-\d{2}/.test(published)
    ? shiftDate(published, -14)
    : shiftDate(today, -400);
  const to = published && /^\d{4}-\d{2}-\d{2}/.test(published)
    ? shiftDate(published, 14)
    : today;
  return `${OCDS}?PageNumber=1&PageSize=20&dateFrom=${from}&dateTo=${to}&ocid=${encodeURIComponent(ocid)}`;
}

export function pickRelease(ocid: string, releases: Release[] | undefined): Release | null {
  if (!releases?.length) return null;
  return releases.find((r) => r.ocid === ocid) ?? releases[0] ?? null;
}

async function readJsonCapped(res: Response): Promise<unknown | null> {
  const reader = res.body?.getReader();
  if (!reader) {
    try { return await res.json(); } catch { return null; }
  }
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    total += value.byteLength;
    if (total > MAX_BYTES) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const combined = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return JSON.parse(new TextDecoder().decode(combined));
  } catch {
    return null;
  }
}

export function bbbeeLevelNumber(...parts: Array<string | null | undefined>): number | null {
  const label = bbbeeFromText(...parts);
  if (!label) return null;
  const n = Number(label.replace(/\D/g, ''));
  return n >= 1 && n <= 8 ? n : null;
}

export async function fetchOfficialRelease(
  sourceRef: string | null | undefined,
  published?: string | null,
): Promise<Release | null> {
  const ocid = String(sourceRef || '').trim();
  if (!ocid.startsWith('ocds-')) return null;
  const url = officialFetchUrl(ocid, published);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: {
        Accept: 'application/json',
        'User-Agent': 'Tenderpreneurs/1.0 (+https://tenderpreneurs.co.za)',
      },
    });
    if (!res.ok) return null;
    const body = (await readJsonCapped(res)) as { releases?: Release[] } | null;
    return pickRelease(ocid, body?.releases);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function valueToCents(amount: number): number | null {
  if (!Number.isFinite(amount) || amount <= 0) return null;
  if (amount >= 1_000_000_000) return Math.round(amount);
  return Math.round(amount * 100);
}

function validBriefingDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const day = iso.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
  if (day.startsWith('0001-') || day.startsWith('1900-')) return null;
  return day;
}

export function patchFromRelease(release: Release, current: Record<string, unknown>): EnrichPatch {
  const t = release.tender ?? {};
  const patch: EnrichPatch = { enrich_source: 'ocds' };
  const desc = (t.description || '').trim();
  if (desc && (!current.description || String(current.description).length < desc.length)) {
    patch.description = desc.slice(0, 4000);
  }
  const buyer = t.procuringEntity?.name || release.buyer?.name;
  if (buyer && !current.procuring_entity) patch.procuring_entity = buyer;
  if (t.tenderPeriod?.endDate) {
    const day = t.tenderPeriod.endDate.slice(0, 10);
    const clock = clockFromIso(t.tenderPeriod.endDate);
    if (!current.closing_date) patch.closing_date = day;
    if (clock && !current.closing_time) patch.closing_time = clock;
  }
  if (t.tenderPeriod?.startDate && !current.published_date) {
    const start = t.tenderPeriod.startDate.slice(0, 10);
    if (!start.startsWith('0001-')) patch.published_date = start;
  }
  if (t.briefingSession?.isSession) {
    const bday = validBriefingDate(t.briefingSession.date);
    if (bday && !current.briefing_date) patch.briefing_date = bday;
    if (t.briefingSession.venue && t.briefingSession.venue !== 'N/A' && !current.briefing_location) {
      patch.briefing_location = t.briefingSession.venue;
    }
    if (t.briefingSession.compulsory) patch.briefing_compulsory = 1;
  }
  if (t.contactPerson?.name && !current.contact_name) patch.contact_name = t.contactPerson.name;
  if (t.contactPerson?.email && !current.contact_email) patch.contact_email = t.contactPerson.email;
  if (t.contactPerson?.telephoneNumber && !current.contact_phone) patch.contact_phone = t.contactPerson.telephoneNumber;
  const cidb = cidbFromText(t.title, t.description, t.specialConditions, String(current.title || ''), String(current.description || ''));
  if (cidb && !current.cidb_grade) patch.cidb_grade = cidb;
  const cents = t.value?.amount != null ? valueToCents(Number(t.value.amount)) : null;
  if (cents && !current.estimated_value) patch.estimated_value = cents;
  const docs = (t.documents ?? []).filter((d) => d.url);
  if (docs.length && !current.documents_json) {
    patch.documents_json = JSON.stringify(docs.map((d) => ({
      filename: d.title || d.description || 'Document',
      url: d.url,
    })));
  }
  if ((t.procurementMethod || t.procurementMethodDetails) && !current.submission_method) {
    patch.submission_method = t.procurementMethodDetails || t.procurementMethod;
  }
  if (t.id && !current.source_url) {
    patch.source_url = `https://www.etenders.gov.za/home/TenderDetails?tenderID=${t.id}`;
  }
  const notes = [
    t.deliveryLocation ? `Delivery: ${t.deliveryLocation}` : '',
    t.specialConditions ? `Special conditions: ${t.specialConditions}` : '',
    t.category ? `Category: ${t.category}` : '',
    ...(t.awardCriteria?.criteria ?? []).map((c) => [c.type, c.description].filter(Boolean).join(': ')),
  ].filter(Boolean);
  if (notes.length && !current.evaluation_notes) patch.evaluation_notes = notes.join('\n').slice(0, 2000);
  const bbbee = bbbeeFromText(t.description, t.specialConditions, String(current.description || ''));
  if (bbbee) patch.bbbee_level = bbbee;
  const ret = returnablesFromText(t.description, t.specialConditions, String(current.description || ''));
  if (!current.returnables_json) patch.returnables_json = JSON.stringify(ret);
  return patch;
}

export function isThinRow(row: Record<string, unknown>): boolean {
  const desc = String(row.description || '');
  const docs = String(row.documents_json || '');
  return desc.length < 80 || !row.closing_time || !docs || !row.contact_email;
}
