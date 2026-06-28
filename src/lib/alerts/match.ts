/**
 * src/lib/alerts/match.ts
 *
 * Alert matching core — decides whether a tender is relevant to a supplier
 * profile AND whether the supplier is eligible. PURE / testable. The D1 job
 * and channel senders call this; it owns the "relevant tenders only" promise.
 */
import { parseCidb } from '../winscore.ts';

export interface AlertProfile {
  provinces: string[];     // slugs
  sectors: string[];       // slugs
  keywords: string[];      // lowercased phrases
  cidb_grades: string[];   // e.g. ['6CE','4GB'] — supports multiple (review R1)
}

export interface AlertTender {
  id: string;
  title: string;
  sector: string | null;
  province: string | null;
  cidb_grade: string | null;
}

export interface MatchResult {
  match: boolean;
  eligible: boolean;
  reasons: string[];
}

/** Eligibility gate: if the tender requires a CIDB grade, the firm must hold
 *  a grade in the SAME class at >= the required grade. */
export function isEligible(tender: AlertTender, profile: AlertProfile): boolean {
  const req = parseCidb(tender.cidb_grade);
  if (!req) return true; // no CIDB requirement → eligible on this axis
  return (profile.cidb_grades ?? []).some(g => {
    const held = parseCidb(g);
    return held && held.cls === req.cls && held.grade >= req.grade;
  });
}

export function matchesProfile(tender: AlertTender, profile: AlertProfile): MatchResult {
  const reasons: string[] = [];

  // Province scope: national always in scope; else must be a province they cover.
  const provinceOk =
    tender.province === 'national' ||
    !tender.province ||
    (profile.provinces ?? []).includes(tender.province);

  // Relevance: sector match OR keyword hit in the title.
  const sectorOk = !!tender.sector && (profile.sectors ?? []).includes(tender.sector);
  const title = (tender.title ?? '').toLowerCase();
  const keywordHit = (profile.keywords ?? []).find(k => k && title.includes(k.toLowerCase()));

  if (sectorOk) reasons.push(`sector: ${tender.sector}`);
  if (keywordHit) reasons.push(`keyword: "${keywordHit}"`);

  const relevant = provinceOk && (sectorOk || !!keywordHit);
  const eligible = isEligible(tender, profile);

  if (relevant && !eligible) reasons.push('not eligible (CIDB grade/class)');

  // Only alert when relevant AND eligible — this is the noise-reduction guarantee.
  return { match: relevant && eligible, eligible, reasons };
}
