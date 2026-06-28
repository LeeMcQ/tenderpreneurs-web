/**
 * src/lib/verifier/rules.ts
 *
 * Tender Verifier — deterministic checks. PURE functions, no LLM, no DB.
 * These carry the compliance weight; the optional LLM pass only explains/prioritises.
 * Every flag references a corpus rule_ref and is "guidance, not legal advice".
 */
import corpus from './corpus.json';

export type Severity = 'info' | 'warning' | 'critical';

export interface Flag {
  id: string;
  category: string;
  severity: Severity;
  rule_ref: string;
  message: string;
  suggested_action: string;
}

export interface VerifyTender {
  title?: string | null;
  description?: string | null;
  category?: string | null;            // 'construction' | ...
  published_date?: string | null;      // ISO date
  closing_date?: string | null;        // ISO date
  closing_time?: string | null;        // HH:MM
  briefing_date?: string | null;       // ISO date
  briefing_compulsory?: number | boolean | null;
  cidb_grade?: string | null;
  estimated_value?: number | null;     // ZAR cents
  preference_system?: string | null;   // '80/20' | '90/10'
  contact_name?: string | null;
  contact_email?: string | null;
  contact_phone?: string | null;
  documents_count?: number | null;
}

const RULES: Record<string, Omit<Flag, never>> = Object.fromEntries(
  (corpus as any).rules.map((r: any) => [r.id, r]),
);

export const CORPUS_META = {
  framework_version: (corpus as any).framework_version,
  disclaimer: (corpus as any).disclaimer,
  note: (corpus as any).note,
};

const PREF_THRESHOLD_CENTS = 50_000_000_00; // R50m

function flag(id: string): Flag {
  const r = RULES[id] as any;
  return { id, category: r.category ?? 'legal', severity: r.severity as Severity, rule_ref: r.rule_ref, message: r.message, suggested_action: r.suggested_action };
}
function days(fromISO?: string | null, toISO?: string | null): number | null {
  if (!fromISO || !toISO) return null;
  const a = Date.parse(fromISO + 'T00:00:00Z'), b = Date.parse(toISO + 'T00:00:00Z');
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  return Math.round((b - a) / 86_400_000);
}
function looksConstruction(t: VerifyTender): boolean {
  if (t.category === 'construction') return true;
  const s = `${t.title ?? ''} ${t.description ?? ''}`.toLowerCase();
  return /\b(construction|build(ing)?|civil|road|bridge|refurbish|renovation|water reticulation|electrical installation)\b/.test(s);
}

/** Run all deterministic checks. `todayISO` injectable for tests. */
export function runRuleChecks(t: VerifyTender, todayISO: string = new Date().toISOString().slice(0, 10), history: { change_type?: string }[] = []): Flag[] {
  const flags: Flag[] = [];

  if (!t.closing_date) flags.push(flag('no_closing_date'));
  else if (!t.closing_time) flags.push(flag('closing_no_time'));

  const pubToClose = days(t.published_date, t.closing_date);
  if (pubToClose != null && pubToClose <= 0) flags.push(flag('closing_before_published'));
  else if (pubToClose != null && pubToClose < 14) flags.push(flag('short_advertising_window'));

  const briefToClose = days(t.briefing_date, t.closing_date);
  if (briefToClose != null && briefToClose <= 0) flags.push(flag('briefing_after_close'));

  const compulsory = t.briefing_compulsory === true || t.briefing_compulsory === 1;
  const briefToToday = days(todayISO, t.briefing_date);
  if (compulsory && briefToToday != null && briefToToday < 0) flags.push(flag('compulsory_briefing_passed'));

  if (looksConstruction(t) && !t.cidb_grade) flags.push(flag('construction_no_cidb'));
  if (looksConstruction(t) && (t.documents_count ?? 0) === 0) flags.push(flag('specs_missing'));

  if (t.estimated_value == null) {
    flags.push(flag('value_not_stated'));
  } else if (!t.preference_system) {
    flags.push(flag('preference_system_missing'));
  } else {
    const expected = t.estimated_value <= PREF_THRESHOLD_CENTS ? '80/20' : '90/10';
    if (t.preference_system.replace(/\s/g, '') !== expected) flags.push(flag('preference_system_mismatch'));
  }

  if (!t.contact_name && !t.contact_email && !t.contact_phone) flags.push(flag('no_contact_details'));

  if (history.some(h => h.change_type === 'extended' || h.change_type === 'updated')) {
    flags.push(flag('deviation_or_extension_flag'));
  }

  return flags;
}

export interface PeerStat { advertising_days: number | null; estimated_value: number | null; }

/** Compare a subject tender to peers (same sector/category/value band). PURE. */
export function peerAnomaly(
  subject: { advertising_days: number | null; estimated_value: number | null },
  peers: PeerStat[],
): { flags: Flag[]; context: { n: number; median_value: number | null; median_window: number | null } } {
  const flags: Flag[] = [];
  const vals = peers.map(p => p.estimated_value).filter((v): v is number => v != null).sort((a, b) => a - b);
  const wins = peers.map(p => p.advertising_days).filter((v): v is number => v != null).sort((a, b) => a - b);
  const median = (arr: number[]) => arr.length ? arr[Math.floor(arr.length / 2)] : null;
  const mv = median(vals), mw = median(wins);

  if (subject.estimated_value != null && mv != null && vals.length >= 5) {
    if (subject.estimated_value > mv * 5 || subject.estimated_value < mv / 5) flags.push(flag('peer_value_anomaly'));
  }
  if (subject.advertising_days != null && mw != null && wins.length >= 5) {
    if (subject.advertising_days < mw * 0.5) flags.push(flag('peer_window_anomaly'));
  }
  return { flags, context: { n: peers.length, median_value: mv, median_window: mw } };
}

/** Compose 0..100 health score from flags. */
export function healthScore(flags: Flag[]): number {
  let s = 100;
  for (const f of flags) s -= f.severity === 'critical' ? 25 : f.severity === 'warning' ? 10 : 2;
  return Math.max(0, Math.min(100, s));
}
