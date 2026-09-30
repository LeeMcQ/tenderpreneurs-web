/** Document expiry tape from a JSON blob of labelled dates. */

export type ExpiryItem = {
  key: string;
  label: string;
  date: string;
  days: number | null;
  state: 'missing' | 'expired' | 'soon' | 'ok';
};

const LABELS: Record<string, string> = {
  tax_pin: 'SARS tax PIN',
  csd: 'CSD report',
  bbbee: 'B-BBEE affidavit / certificate',
  coid: 'COID / letter of good standing',
  cidb: 'CIDB registration',
  bank: 'Bank confirmation letter',
};

function daysUntil(iso: string, now: Date): number | null {
  const d = new Date(iso.slice(0, 10) + 'T12:00:00');
  if (Number.isNaN(d.getTime())) return null;
  return Math.round((d.getTime() - now.getTime()) / 86400000);
}

export function parseExpiry(raw: string | null | undefined, now = new Date()): ExpiryItem[] {
  if (!raw) return [];
  let obj: unknown;
  try { obj = JSON.parse(raw); } catch { return []; }
  if (!obj || typeof obj !== 'object') return [];
  const items: ExpiryItem[] = [];
  for (const [key, val] of Object.entries(obj as Record<string, unknown>)) {
    const date = typeof val === 'string' ? val : val && typeof val === 'object' && 'date' in (val as any)
      ? String((val as any).date || '')
      : '';
    const label = LABELS[key] || key.replace(/_/g, ' ');
    if (!date) {
      items.push({ key, label, date: '', days: null, state: 'missing' });
      continue;
    }
    const days = daysUntil(date, now);
    const state = days == null ? 'missing' : days < 0 ? 'expired' : days <= 30 ? 'soon' : 'ok';
    items.push({ key, label, date: date.slice(0, 10), days, state });
  }
  return items;
}

export const EXPIRY_KEYS = ['tax_pin', 'csd', 'bbbee', 'coid', 'cidb', 'bank'] as const;

/** Keep only dated YYYY-MM-DD values for known document keys. */
export function expiryFromForm(raw: unknown): string {
  const src = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};
  const out: Record<string, string> = {};
  for (const key of EXPIRY_KEYS) {
    const val = src[key];
    const date = typeof val === 'string' ? val.slice(0, 10) : '';
    if (/^\d{4}-\d{2}-\d{2}$/.test(date)) out[key] = date;
  }
  return JSON.stringify(out);
}

export function expiryHeadline(items: ExpiryItem[]): string {
  const expired = items.filter((i) => i.state === 'expired');
  const soon = items.filter((i) => i.state === 'soon');
  if (expired.length) return `${expired.length} document${expired.length === 1 ? '' : 's'} expired.`;
  if (soon.length) return `${soon.length} document${soon.length === 1 ? '' : 's'} expire within 30 days.`;
  if (!items.length) return 'No document dates saved yet.';
  return 'Saved documents are in date.';
}
