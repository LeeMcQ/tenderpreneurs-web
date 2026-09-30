export const EVENT_NAMES = [
  'tender_view',
  'tender_save',
  'tender_unsave',
  'official_link_out',
  'tender_check_run',
  'finding_accepted',
  'search_run',
  'alert_sent',
  'alert_open',
  'alert_click',
  'create_draft_start',
  'review_run',
  'draft_export',
  'signup',
  'session_start',
  'gate_hit',
  'source_click',
  'error_shown',
] as const;

export type EventName = (typeof EVENT_NAMES)[number];

export function isEventName(s: string): s is EventName {
  return (EVENT_NAMES as readonly string[]).includes(s);
}

export function hashUser(id: string | null | undefined): string | null {
  if (!id) return null;
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16);
}

export function sanitizeProps(raw: unknown): Record<string, string | number | boolean | null> {
  if (!raw || typeof raw !== 'object') return {};
  const out: Record<string, string | number | boolean | null> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (['email', 'phone', 'name', 'password'].includes(k.toLowerCase())) continue;
    if (typeof v === 'string') out[k] = v.slice(0, 120);
    else if (typeof v === 'number' || typeof v === 'boolean' || v === null) out[k] = v;
  }
  return out;
}
