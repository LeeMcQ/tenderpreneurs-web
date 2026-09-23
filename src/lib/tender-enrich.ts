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
};

const CIDB = /\b([1-9]\s?(?:GB|CE|EB|EP|ME|SW|SB|SQ|PE))\b/i;
const OCDS = 'https://ocds-api.etenders.gov.za/api/OCDSReleases';

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

type Release = {
  ocid?: string;
  date?: string;
  tender?: {
    id?: string;
    title?: string;
    description?: string;
    status?: string;
    category?: string;
    province?: string;
    procurementMethod?: string;
    value?: { amount?: number; currency?: string };
    documents?: Array<{ url?: string; title?: string; description?: string }>;
    tenderPeriod?: { startDate?: string; endDate?: string };
    procuringEntity?: { name?: string };
    briefingSession?: { isSession?: boolean; compulsory?: boolean; date?: string; venue?: string };
    contactPerson?: { name?: string; email?: string; telephoneNumber?: string };
  };
  buyer?: { name?: string };
};

export async function fetchOfficialRelease(sourceRef: string | null | undefined): Promise<Release | null> {
  const ocid = String(sourceRef || '').trim();
  if (!ocid.startsWith('ocds-')) return null;
  const url = `${OCDS}?PageNumber=1&PageSize=5&ocid=${encodeURIComponent(ocid)}`;
  try {
    const res = await fetch(url, {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'Tenderpreneurs/1.0 (+https://tenderpreneurs.co.za)',
      },
    });
    if (!res.ok) return null;
    const body = await res.json() as { releases?: Release[] };
    return body.releases?.[0] ?? null;
  } catch {
    return null;
  }
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
    patch.published_date = t.tenderPeriod.startDate.slice(0, 10);
  }
  if (t.briefingSession?.isSession) {
    if (t.briefingSession.date && !current.briefing_date) patch.briefing_date = t.briefingSession.date.slice(0, 10);
    if (t.briefingSession.venue && !current.briefing_location) patch.briefing_location = t.briefingSession.venue;
    if (t.briefingSession.compulsory) patch.briefing_compulsory = 1;
  }
  if (t.contactPerson?.name && !current.contact_name) patch.contact_name = t.contactPerson.name;
  if (t.contactPerson?.email && !current.contact_email) patch.contact_email = t.contactPerson.email;
  if (t.contactPerson?.telephoneNumber && !current.contact_phone) patch.contact_phone = t.contactPerson.telephoneNumber;
  const cidb = cidbFromText(t.title, t.description, String(current.title || ''), String(current.description || ''));
  if (cidb && !current.cidb_grade) patch.cidb_grade = cidb;
  if (t.value?.amount && !current.estimated_value) {
    const amount = Number(t.value.amount);
    if (Number.isFinite(amount) && amount > 0) {
      patch.estimated_value = amount > 10_000_000 ? Math.round(amount) : Math.round(amount * 100);
    }
  }
  const docs = (t.documents ?? []).filter((d) => d.url);
  if (docs.length && !current.documents_json) {
    patch.documents_json = JSON.stringify(docs.map((d) => ({
      filename: d.title || d.description || 'Document',
      url: d.url,
    })));
  }
  if (t.procurementMethod && !current.submission_method) patch.submission_method = t.procurementMethod;
  if (t.id && !current.source_url) {
    patch.source_url = `https://www.etenders.gov.za/home/TenderDetails?tenderID=${t.id}`;
  }
  return patch;
}

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
