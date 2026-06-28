/**
 * src/lib/winscore-resolve.ts
 * Single source of truth for turning (user, tender) → a win-score result.
 * Used by the API endpoint AND by the detail page for server-side rendering
 * (kills the client fetch waterfall for signed-in users — review item R8).
 * PII (the profile) never leaves the worker.
 */
import { computeWinScore, parseCidb, type TenderInput, type SupplierProfile } from './winscore.ts';

export type WinResolution =
  | { locked: true; reason: 'auth' | 'profile' }
  | { locked: false; win: ReturnType<typeof computeWinScore> }
  | { error: string };

function safeArray(json: unknown): string[] {
  if (typeof json !== 'string' || !json) return [];
  try { const v = JSON.parse(json); return Array.isArray(v) ? v.map(String) : []; }
  catch { return []; }
}

export async function resolveWinScore(env: any, userId: string | null | undefined, tenderId: string): Promise<WinResolution> {
  if (!userId) return { locked: true, reason: 'auth' };

  const profileRow = await env.DB.prepare(
    `SELECT cidb_grades_json, bbbee_level, capacity_value_max, provinces_json, sectors_json
     FROM supplier_profiles WHERE user_id = ?`
  ).bind(userId).first();
  if (!profileRow) return { locked: true, reason: 'profile' };

  const t = await env.DB.prepare(
    `SELECT sector, province, estimated_value, cidb_grade, category,
            closing_date, closing_time, briefing_date, briefing_compulsory,
            bbbee_required, preference_system
     FROM tenders WHERE id = ? AND canonical_ref IS NULL`
  ).bind(tenderId).first();
  if (!t) return { error: 'tender not found' };

  const tender: TenderInput = {
    sector: (t.sector as string) ?? null,
    province: (t.province as string) ?? null,
    estimated_value: (t.estimated_value as number) ?? null,
    cidb_grade: (t.cidb_grade as string) ?? null,
    category: (t.category as string) ?? null,
    closing_date: (t.closing_date as string) ?? null,
    closing_time: (t.closing_time as string) ?? null,
    briefing_date: (t.briefing_date as string) ?? null,
    briefing_compulsory: (t.briefing_compulsory as number) ?? 0,
    bbbee_required: (t.bbbee_required as number) ?? null,
    preference_system: (t.preference_system as string) ?? null,
  };

  // Pick the held CIDB grade that best matches the tender's required class (R1).
  const heldGrades = safeArray((profileRow as any).cidb_grades_json);
  const reqClass = parseCidb((t.cidb_grade as string) ?? null)?.cls ?? null;
  let chosenGrade: string | null = null;
  if (reqClass) {
    const inClass = heldGrades
      .map(g => ({ g, p: parseCidb(g) }))
      .filter(x => x.p && x.p.cls === reqClass)
      .sort((a, b) => (b.p!.grade - a.p!.grade));
    chosenGrade = inClass[0]?.g ?? heldGrades[0] ?? null;
  } else {
    chosenGrade = heldGrades[0] ?? null;
  }

  const profile: SupplierProfile = {
    cidb_grade: chosenGrade,
    bbbee_level: ((profileRow as any).bbbee_level as number) ?? null,
    capacity_value_max: ((profileRow as any).capacity_value_max as number) ?? null,
    provinces: safeArray((profileRow as any).provinces_json),
    sectors: safeArray((profileRow as any).sectors_json),
  };

  return { locked: false, win: computeWinScore(tender, profile) };
}
