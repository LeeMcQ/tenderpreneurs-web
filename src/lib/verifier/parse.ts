/**
 * src/lib/verifier/parse.ts
 * Turns a raw model response into validated CandidateFlaw[]. This is the safety
 * layer: invented codes are dropped, category is forced from the taxonomy (never
 * trusted from the model), severity is clamped, strings are trimmed/capped, and
 * any unparseable response yields []. PURE / heavily tested.
 */
import { VALID_CODES, CODE_CATEGORY } from './taxonomy.ts';
import type { CandidateFlaw, Severity } from './orchestrate.ts';

const SEVERITIES: Severity[] = ['info', 'warning', 'critical'];
const MAX_LEN = 600;

function clean(s: unknown): string {
  return typeof s === 'string' ? s.trim().slice(0, MAX_LEN) : '';
}

/** Extract the first balanced top-level JSON value (object or array) from text. */
function extractJsonObject(raw: string): string | null {
  const text = raw.replace(/```(?:json)?/gi, '').trim();
  const oi = text.indexOf('{'), ai = text.indexOf('[');
  const candidates = [oi, ai].filter(i => i !== -1);
  if (candidates.length === 0) return null;
  const start = Math.min(...candidates);
  let depth = 0, inStr = false, esc = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === '\\') esc = true;
      else if (ch === '"') inStr = false;
    } else if (ch === '"') inStr = true;
    else if (ch === '{' || ch === '[') depth++;
    else if (ch === '}' || ch === ']') { depth--; if (depth === 0) return text.slice(start, i + 1); }
  }
  return null;
}

export function parseEngineResponse(raw: string): CandidateFlaw[] {
  if (!raw || typeof raw !== 'string') return [];
  const jsonStr = extractJsonObject(raw);
  if (!jsonStr) return [];

  let parsed: any;
  try { parsed = JSON.parse(jsonStr); } catch { return []; }

  const list = Array.isArray(parsed?.flaws) ? parsed.flaws : Array.isArray(parsed) ? parsed : [];
  const out: CandidateFlaw[] = [];
  const seen = new Set<string>();

  for (const f of list) {
    const code = clean(f?.code);
    if (!VALID_CODES.has(code)) continue;        // drop invented / unknown codes
    if (seen.has(code)) continue;                // one per code per engine
    seen.add(code);

    const severity: Severity = SEVERITIES.includes(f?.severity) ? f.severity : 'warning';
    const message = clean(f?.message);
    if (!message) continue;                       // a flaw with no statement is noise

    out.push({
      category: CODE_CATEGORY[code],              // authoritative, not model-chosen
      code,
      severity,
      message,
      suggested_fix: clean(f?.suggested_fix),
      rule_ref: clean(f?.rule_ref) || undefined,
    });
  }
  return out;
}
