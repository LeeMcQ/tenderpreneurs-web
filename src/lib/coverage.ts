/** Honest source coverage — never invent completeness. */

export type HealthRow = {
  source: string;
  last_ok_at?: string | null;
  last_fail_at?: string | null;
  last_http?: number | null;
  last_error?: string | null;
  items_ok?: number | null;
  items_fail?: number | null;
  note?: string | null;
};

export type HealthStatus = 'ok' | 'stale' | 'fail' | 'unknown';

const LABELS: Record<string, string> = {
  etenders: 'National Treasury eTenders',
  etenders_ocds: 'eTenders OCDS',
  sanral: 'SANRAL',
  eskom: 'Eskom',
  transnet: 'Transnet',
  cct: 'City of Cape Town',
  acsa: 'ACSA',
  dbsa: 'DBSA',
  coj: 'City of Johannesburg',
  tshwane: 'City of Tshwane',
  ekurhuleni: 'City of Ekurhuleni',
  gtb: 'Gauteng Treasury',
};

export function sourceLabel(source: string): string {
  return LABELS[source] || source;
}

export function healthStatus(row: HealthRow | null | undefined, now = new Date()): HealthStatus {
  if (!row) return 'unknown';
  const okAt = row.last_ok_at ? new Date(row.last_ok_at).getTime() : 0;
  const failAt = row.last_fail_at ? new Date(row.last_fail_at).getTime() : 0;
  if (row.last_error && failAt >= okAt) return 'fail';
  if (!okAt) return 'unknown';
  const ageH = (now.getTime() - okAt) / 36e5;
  if (ageH > 36) return 'stale';
  return 'ok';
}

export function coverageSentence(rows: HealthRow[], now = new Date()): string {
  if (!rows.length) return 'Coverage board is empty — ingest has not written health yet.';
  const ok = rows.filter((r) => healthStatus(r, now) === 'ok').length;
  const fail = rows.filter((r) => healthStatus(r, now) === 'fail').length;
  return `${ok} of ${rows.length} sources healthy in the last 36 hours${fail ? ` · ${fail} failing` : ''}.`;
}
