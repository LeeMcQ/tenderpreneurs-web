/**
 * src/lib/winscore.ts
 *
 * Win Probability AI — v1 (rules-based, fully explainable, no LLM, no PII egress).
 *
 * IMPORTANT (honesty): v1 is a *fit / readiness estimate*, not a calibrated
 * statistical probability. It answers "are you eligible and well-matched for
 * this tender?" — not "what fraction of bidders like you historically won?".
 * The latter is v2, once the `awards` table has enough data to calibrate.
 * Every result therefore carries `disclaimer` and surfaces its reasons.
 *
 * Pure functions only — safe to unit-test outside the Cloudflare runtime.
 */

export interface TenderInput {
  sector: string | null;
  province: string | null;              // slug; may be 'national'
  estimated_value: number | null;       // ZAR cents; frequently null in SA tenders
  cidb_grade: string | null;            // e.g. "5CE", "7 GB"; null for non-construction
  category: string | null;              // 'construction' | 'goods' | 'services' | 'other'
  closing_date: string | null;          // ISO date 'YYYY-MM-DD'
  closing_time: string | null;          // 'HH:MM' (24h), if known
  briefing_date: string | null;         // ISO date
  briefing_compulsory: number | boolean | null;
  bbbee_required: number | null;        // 1..8 required minimum, or null
  preference_system: string | null;     // '80/20' | '90/10' | null
}

export interface SupplierProfile {
  cidb_grade: string | null;            // single held grade, e.g. "6CE"
  bbbee_level: number | null;           // 1 (best) .. 8 (none)
  provinces: string[];                  // slugs the firm operates in
  sectors: string[];                    // slugs the firm works in
  capacity_value_max: number | null;    // ZAR cents — largest contract they can deliver
}

export type ReasonStatus = 'pass' | 'warn' | 'fail' | 'info';
export interface Reason {
  code: string;
  label: string;
  status: ReasonStatus;
  detail: string;
}

export type Band = 'ineligible' | 'low' | 'medium' | 'high';

export interface WinScore {
  score: number;        // 0..100 — fit/readiness estimate (NOT a calibrated probability)
  band: Band;
  blocking: boolean;    // true when a hard eligibility gate fails
  reasons: Reason[];
  asOf: string;         // ISO timestamp
  disclaimer: string;
}

const DISCLAIMER =
  'Estimate based on your profile and the tender details available — not a ' +
  'guarantee of award. Verify eligibility against the official tender documents.';

/** Parse a CIDB grade like "5CE", "7 GB", "9SB" into { grade, cls }. */
export function parseCidb(raw: string | null | undefined): { grade: number; cls: string } | null {
  if (!raw) return null;
  // Normalise spacing so '5 CE PE' and '5CEPE' both parse. Capture grade + the
  // 2-letter class of works; ignore trailing designations like 'PE'.
  const s = String(raw).trim().toUpperCase().replace(/\s+/g, '');
  const m = s.match(/^(\d)([A-Z]{2})[A-Z]*$/);
  if (!m) return null;
  const grade = parseInt(m[1], 10);
  if (!Number.isFinite(grade) || grade < 1 || grade > 9) return null;
  return { grade, cls: m[2] };
}

function daysBetween(fromISO: string, toISO: string): number {
  const a = Date.parse(fromISO + 'T00:00:00Z');
  const b = Date.parse(toISO + 'T00:00:00Z');
  if (Number.isNaN(a) || Number.isNaN(b)) return NaN;
  return Math.round((b - a) / 86_400_000);
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

/**
 * Compute the v1 win/fit score.
 * @param tender   tender attributes (nulls tolerated throughout)
 * @param profile  the signed-in supplier's profile
 * @param todayISO injectable "today" (YYYY-MM-DD) for deterministic tests
 */
export function computeWinScore(
  tender: TenderInput,
  profile: SupplierProfile,
  todayISO: string = new Date().toISOString().slice(0, 10),
  nowHHMM: string = new Date().toTimeString().slice(0, 5),
): WinScore {
  const reasons: Reason[] = [];
  let blocking = false;
  let score = 50; // neutral base before adjustments

  // ── Hard gate 1: tender already closed ───────────────────────────────
  if (tender.closing_date) {
    const d = daysBetween(todayISO, tender.closing_date);
    if (!Number.isNaN(d) && d < 0) {
      reasons.push({
        code: 'closed',
        label: 'Tender has closed',
        status: 'fail',
        detail: 'The closing date has already passed — submissions are no longer accepted.',
      });
      blocking = true;
    } else if (d === 0 && tender.closing_time && nowHHMM >= tender.closing_time) {
      reasons.push({
        code: 'closed',
        label: 'Tender has closed',
        status: 'fail',
        detail: `The closing time (${tender.closing_time}) has passed today — submissions are no longer accepted.`,
      });
      blocking = true;
    }
  }

  // ── Hard gate 2: compulsory briefing already passed ──────────────────
  const compulsory = tender.briefing_compulsory === true || tender.briefing_compulsory === 1;
  if (compulsory && tender.briefing_date) {
    const d = daysBetween(todayISO, tender.briefing_date);
    if (!Number.isNaN(d) && d < 0) {
      reasons.push({
        code: 'briefing_missed',
        label: 'Compulsory briefing missed',
        status: 'fail',
        detail: 'Attendance at the compulsory briefing was required and its date has passed. Bids are typically disqualified without it.',
      });
      blocking = true;
    } else if (!Number.isNaN(d) && d >= 0) {
      reasons.push({
        code: 'briefing_upcoming',
        label: 'Compulsory briefing required',
        status: 'warn',
        detail: `You must attend the compulsory briefing on ${tender.briefing_date} to be eligible.`,
      });
    }
  }

  // ── Hard gate 3: CIDB grade (construction) ───────────────────────────
  const reqCidb = parseCidb(tender.cidb_grade);
  if (reqCidb) {
    const heldCidb = parseCidb(profile.cidb_grade);
    if (!heldCidb) {
      reasons.push({
        code: 'cidb_missing',
        label: 'CIDB grade required',
        status: 'fail',
        detail: `This tender requires CIDB ${tender.cidb_grade}. No CIDB grade is on your profile.`,
      });
      blocking = true;
    } else if (heldCidb.cls !== reqCidb.cls) {
      reasons.push({
        code: 'cidb_class',
        label: 'CIDB class mismatch',
        status: 'fail',
        detail: `Requires class ${reqCidb.cls} (CIDB ${tender.cidb_grade}); your registration is ${profile.cidb_grade}. A grade in a different class does not qualify.`,
      });
      blocking = true;
    } else if (heldCidb.grade < reqCidb.grade) {
      reasons.push({
        code: 'cidb_low',
        label: 'CIDB grade too low',
        status: 'fail',
        detail: `Requires CIDB ${tender.cidb_grade}; you hold ${profile.cidb_grade}. The required grade exceeds yours.`,
      });
      blocking = true;
    } else {
      reasons.push({
        code: 'cidb_ok',
        label: 'CIDB grade met',
        status: 'pass',
        detail: `You hold ${profile.cidb_grade}, meeting the required CIDB ${tender.cidb_grade}.`,
      });
      if (heldCidb.grade - reqCidb.grade >= 2) {
        reasons.push({
          code: 'cidb_headroom',
          label: 'Comfortably above required grade',
          status: 'info',
          detail: 'Your grade is well above the minimum — typically a strong eligibility position.',
        });
      }
    }
  }

  // ── Fit signal: sector ───────────────────────────────────────────────
  if (tender.sector) {
    if (profile.sectors?.includes(tender.sector)) {
      score += 20;
      reasons.push({
        code: 'sector_match',
        label: 'In your sector',
        status: 'pass',
        detail: `This is a ${tender.sector} tender, one of your registered sectors.`,
      });
    } else {
      score -= 10;
      reasons.push({
        code: 'sector_off',
        label: 'Outside your usual sectors',
        status: 'warn',
        detail: `This is a ${tender.sector} tender, which is not in your profile.`,
      });
    }
  }

  // ── Fit signal: province ─────────────────────────────────────────────
  if (tender.province) {
    if (tender.province === 'national' || profile.provinces?.includes(tender.province)) {
      score += 15;
      reasons.push({
        code: 'province_match',
        label: tender.province === 'national' ? 'National opportunity' : 'In your region',
        status: 'pass',
        detail: tender.province === 'national'
          ? 'Open nationally — your location is not a barrier.'
          : `Work is in ${tender.province}, where you operate.`,
      });
    } else {
      score -= 8;
      reasons.push({
        code: 'province_off',
        label: 'Outside your regions',
        status: 'warn',
        detail: `Work is in ${tender.province}; consider the logistics of operating there.`,
      });
    }
  }

  // ── Fit signal: value vs capacity (graceful when value unknown) ──────
  if (tender.estimated_value == null) {
    reasons.push({
      code: 'value_unknown',
      label: 'Value not disclosed',
      status: 'info',
      detail: 'The tender does not state an estimated value, so size-fit cannot be assessed.',
    });
  } else if (profile.capacity_value_max == null) {
    reasons.push({
      code: 'capacity_unknown',
      label: 'Capacity not set',
      status: 'info',
      detail: 'Add your maximum contract value to your profile to assess size-fit.',
    });
  } else {
    const ratio = tender.estimated_value / Math.max(profile.capacity_value_max, 1);
    if (ratio <= 1) {
      score += 10;
      reasons.push({
        code: 'value_fit',
        label: 'Within your capacity',
        status: 'pass',
        detail: 'The contract value is within the maximum you can deliver.',
      });
    } else if (ratio <= 2) {
      score -= 5;
      reasons.push({
        code: 'value_stretch',
        label: 'Larger than your typical max',
        status: 'warn',
        detail: 'The value is above your stated capacity — deliverable, but a stretch.',
      });
    } else {
      score -= 15;
      reasons.push({
        code: 'value_over',
        label: 'Well above your capacity',
        status: 'warn',
        detail: 'The value is more than double your stated maximum — high delivery risk.',
      });
    }
  }

  // ── Fit signal: B-BBEE (soft, indicative only in v1) ─────────────────
  if (profile.bbbee_level == null) {
    reasons.push({
      code: 'bbbee_unknown',
      label: 'B-BBEE level not set',
      status: 'info',
      detail: 'Add your B-BBEE level to factor preference points into your estimate.',
    });
  } else {
    if (tender.bbbee_required != null && profile.bbbee_level > tender.bbbee_required) {
      reasons.push({
        code: 'bbbee_below_req',
        label: 'Below required B-BBEE level',
        status: 'warn',
        detail: `This tender expects at least level ${tender.bbbee_required}; your profile is level ${profile.bbbee_level}.`,
      });
      score -= 6;
    } else if (profile.bbbee_level <= 2) {
      score += 8;
      reasons.push({
        code: 'bbbee_strong',
        label: 'Strong B-BBEE standing',
        status: 'pass',
        detail: 'A level 1–2 status is competitive on preference points (indicative — actual advantage depends on the preference split and other bidders).',
      });
    } else if (profile.bbbee_level <= 4) {
      score += 2;
      reasons.push({
        code: 'bbbee_mid',
        label: 'Moderate B-BBEE standing',
        status: 'info',
        detail: 'A mid B-BBEE level gives some preference-point benefit (indicative only).',
      });
    } else {
      score -= 2;
      reasons.push({
        code: 'bbbee_low',
        label: 'Limited preference advantage',
        status: 'info',
        detail: 'A higher B-BBEE level number yields fewer preference points (indicative only).',
      });
    }
  }

  // ── Fit signal: time to close ────────────────────────────────────────
  if (tender.closing_date && !blocking) {
    const d = daysBetween(todayISO, tender.closing_date);
    if (!Number.isNaN(d)) {
      if (d <= 5) {
        score -= 6;
        reasons.push({
          code: 'closing_soon',
          label: 'Closes very soon',
          status: 'warn',
          detail: `Only ${d} day(s) until closing — tight for preparing a quality bid.`,
        });
      } else if (d <= 10) {
        reasons.push({
          code: 'closing_mid',
          label: 'Closing within ~10 days',
          status: 'info',
          detail: `${d} days to closing — workable but start soon.`,
        });
      } else {
        score += 3;
        reasons.push({
          code: 'closing_ample',
          label: 'Ample time to prepare',
          status: 'info',
          detail: `${d} days until closing.`,
        });
      }
    }
  }

  // ── Compose ──────────────────────────────────────────────────────────
  score = Math.round(clamp(score, 0, 100));

  // Thin-data guard: too few real signals → don't project confidence.
  const substantive = reasons.filter(r => r.status === 'pass' || r.status === 'warn').length;
  const thinData = !blocking && substantive < 2;
  if (thinData) {
    reasons.push({
      code: 'limited_data',
      label: 'Limited data on this tender',
      status: 'info',
      detail: 'Too little information to assess fit confidently — treat this estimate with caution.',
    });
  }

  let band: Band;
  if (blocking) {
    band = 'ineligible';
    score = Math.min(score, 10); // an ineligible tender cannot read as winnable
  } else if (thinData) {
    band = 'low';                // insufficient signal to claim a medium/high fit
  } else if (score < 40) {
    band = 'low';
  } else if (score < 70) {
    band = 'medium';
  } else {
    band = 'high';
  }

  return {
    score,
    band,
    blocking,
    reasons,
    asOf: new Date().toISOString(),
    disclaimer: DISCLAIMER,
  };
}
