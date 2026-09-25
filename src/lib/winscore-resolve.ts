/**
 * (user, tender) → calibrated win probability.
 */
import { computeWinScore, parseCidb, type TenderInput, type SupplierProfile } from './winscore.ts';
import { calibrateWin, type MarketPrior } from './winscore-calibrate.ts';

export type WinResolution =
  | { locked: true; reason: 'auth' | 'profile' }
  | { locked: false; win: ReturnType<typeof calibrateWin> }
  | { error: string };

function safeArray(json: unknown): string[] {
  if (typeof json !== 'string' || !json) return [];
  try { const v = JSON.parse(json); return Array.isArray(v) ? v.map(String) : []; }
  catch { return []; }
}

async function loadMarket(env: any, sector: string | null, province: string | null): Promise<MarketPrior> {
  const market: MarketPrior = { meanBidders: null, awardRows: 0, closedRows: 0, sector };
  try {
    const awards = await env.DB.prepare(
      `SELECT COUNT(*) AS n, AVG(num_bidders) AS mean_bidders
       FROM awards
       WHERE num_bidders IS NOT NULL AND num_bidders >= 2
         AND (? IS NULL OR sector = ?)
         AND (? IS NULL OR province = ? OR province = 'national')`,
    ).bind(sector, sector, province, province).first<{ n: number; mean_bidders: number | null }>();
    market.awardRows = Number(awards?.n ?? 0);
    if (awards?.mean_bidders) market.meanBidders = Number(awards.mean_bidders);
  } catch { /* awards table may be empty */ }

  try {
    const closed = await env.DB.prepare(
      `SELECT COUNT(*) AS n FROM tenders
       WHERE canonical_ref IS NULL
         AND status IN ('closed','awarded','cancelled','complete','unsuccessful')
         AND (? IS NULL OR sector = ?)`,
    ).bind(sector, sector).first<{ n: number }>();
    market.closedRows = Number(closed?.n ?? 0);
  } catch { /* ignore */ }
  return market;
}

export async function resolveWinScore(env: any, userId: string | null | undefined, tenderId: string): Promise<WinResolution> {
  if (!userId) return { locked: true, reason: 'auth' };

  const profileRow = await env.DB.prepare(
    `SELECT cidb_grades_json, bbbee_level, capacity_value_max, provinces_json, sectors_json
     FROM supplier_profiles WHERE user_id = ?`,
  ).bind(userId).first();
  if (!profileRow) return { locked: true, reason: 'profile' };

  const t = await env.DB.prepare(
    `SELECT sector, province, estimated_value, cidb_grade, category,
            closing_date, closing_time, briefing_date, briefing_compulsory,
            bbbee_required, preference_system
     FROM tenders WHERE id = ? AND canonical_ref IS NULL`,
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

  const fit = computeWinScore(tender, profile);
  const market = await loadMarket(env, tender.sector, tender.province);
  const cal = calibrateWin(fit, market);
  return {
    locked: false,
    win: {
      ...cal,
      score: cal.probabilityPct,
    },
  };
}
