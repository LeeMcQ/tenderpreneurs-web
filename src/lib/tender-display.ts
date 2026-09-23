/** Shared listing helpers for /tenders and search cards. */

export const GUEST_LIST_LIMIT = 20;

const REF_PREFIX = /^(TFR|RFQ|RFP|RFI|RFT|BID|N\d+|WCG|GT\/|KZN|EC\/|LP\/|MP\/|NW\/|NC\/|FS\/|WC\/|NB|IM|SCMU|PR\d)/i;

export function looksLikeRef(title: string | null | undefined, sourceRef?: string | null): boolean {
  const t = (title ?? '').trim();
  if (!t) return true;
  if (sourceRef && t === sourceRef.trim()) return true;
  if (REF_PREFIX.test(t)) return true;
  const letters = t.replace(/[^A-Za-z]/g, '').length;
  const slashes = (t.match(/\//g) || []).length;
  const words = t.split(/\s+/).filter(Boolean).length;
  if (slashes >= 1 && t.length <= 80 && letters < 16 && /\d/.test(t) && words <= 4) return true;
  if (!/\s/.test(t) && t.length <= 24 && /\d/.test(t) && letters <= 8) return true;
  return false;
}

export function firstSentence(desc: string | null | undefined): string | null {
  if (!desc) return null;
  const cleaned = desc.replace(/\s+/g, ' ').trim();
  if (cleaned.length < 12) return null;
  const cut = cleaned.slice(0, 160);
  const end = cut.search(/[.!?](\s|$)/);
  return (end >= 11 ? cut.slice(0, end + 1) : cut).trim();
}

export function displayTitle(t: {
  title?: string | null;
  source_ref?: string | null;
  description?: string | null;
}): string {
  const title = t.title?.trim() || '';
  if (title && !looksLikeRef(title, t.source_ref)) return title;
  const fromDesc = firstSentence(t.description);
  if (fromDesc) return fromDesc;
  if (title) return title;
  if (t.source_ref) return `Tender ${t.source_ref}`;
  return 'Untitled tender';
}

export function fmtValue(cents: number | null | undefined): string {
  if (cents == null || cents === 0) return '';
  const z = cents / 100;
  if (z >= 1_000_000) return 'R' + (z / 1_000_000).toFixed(1) + 'M';
  if (z >= 1000) return 'R' + Math.round(z / 1000) + 'K';
  return 'R' + Math.round(z).toLocaleString('en-ZA');
}

export function daysToClose(iso: string | null | undefined, now = new Date()): number | null {
  if (!iso) return null;
  const todayZA = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Johannesburg',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
  const d = Math.round(
    (Date.parse(iso.slice(0, 10) + 'T12:00:00Z') - Date.parse(todayZA + 'T12:00:00Z')) / 86400000
  );
  return Number.isNaN(d) ? null : d;
}

export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '';
  return new Date(iso.slice(0, 10) + 'T00:00:00').toLocaleDateString('en-ZA', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export function urgency(
  iso: string | null | undefined,
  time?: string | null,
  now = new Date()
): { text: string; cls: 'u-none' | 'u-red' | 'u-amber' | 'u-neutral' } {
  const d = daysToClose(iso, now);
  const clock = time && String(time).trim() ? ` · ${String(time).trim()}` : '';
  if (d === null) return { text: 'No closing date', cls: 'u-none' };
  if (d < 0) return { text: 'Deadline passed', cls: 'u-none' };
  if (d === 0) return { text: 'Closes today' + clock, cls: 'u-red' };
  if (d <= 3) return { text: `Closes in ${d} day${d > 1 ? 's' : ''}` + clock, cls: 'u-red' };
  if (d <= 7) return { text: `Closes in ${d} days`, cls: 'u-amber' };
  return { text: 'Closes ' + fmtDate(iso), cls: 'u-neutral' };
}

export const PROVINCE_LABELS: Record<string, string> = {
  'eastern-cape': 'Eastern Cape',
  'free-state': 'Free State',
  gauteng: 'Gauteng',
  'kwazulu-natal': 'KwaZulu-Natal',
  limpopo: 'Limpopo',
  mpumalanga: 'Mpumalanga',
  'north-west': 'North West',
  'northern-cape': 'Northern Cape',
  'western-cape': 'Western Cape',
  national: 'National',
};

export function provinceLabel(slug: string | null | undefined): string | null {
  if (!slug) return null;
  return PROVINCE_LABELS[slug] ?? slug.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}
