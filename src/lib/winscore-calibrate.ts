import type { WinScore, Reason } from './winscore';

export type MarketPrior = {
  meanBidders: number | null;
  awardRows: number;
  closedRows: number;
  sector?: string | null;
};

/** Typical submitted-bid counts on SA public work when awards omit bidder numbers. */
export const SECTOR_BIDDERS: Record<string, number> = {
  construction: 14,
  consulting: 9,
  ict: 8,
  health: 10,
  education: 8,
  transport: 11,
  energy: 10,
  security: 12,
  cleaning: 15,
  catering: 12,
  agriculture: 8,
  legal: 6,
};

export function defaultBidders(sector?: string | null): number {
  if (sector && SECTOR_BIDDERS[sector]) return SECTOR_BIDDERS[sector];
  return 10;
}

/** P(win) if you are one eligible bidder among n. */
export function baseRate(market?: MarketPrior): { p0: number; n: number; source: string } {
  const empirical = market?.meanBidders && market.meanBidders >= 2 ? market.meanBidders : null;
  if (empirical) {
    return {
      p0: 1 / empirical,
      n: Math.max(market?.awardRows ?? 0, 4),
      source: `mean ${empirical.toFixed(1)} bidders on ${market!.awardRows} similar awards`,
    };
  }
  const nHat = defaultBidders(market?.sector);
  return {
    p0: 1 / nHat,
    n: Math.max(market?.closedRows ?? 0, 8),
    source: `sector prior ~${nHat} bidders`,
  };
}

function liftFromFit(score: number): number {
  const x = (score - 55) / 22;
  const raw = Math.exp(x);
  return Math.max(0.35, Math.min(2.1, raw));
}

function wilson(p: number, n: number): { lo: number; hi: number } {
  const nn = Math.max(n, 4);
  const z = 1.64;
  const den = 1 + (z * z) / nn;
  const centre = (p + (z * z) / (2 * nn)) / den;
  const half = (z / den) * Math.sqrt((p * (1 - p) + (z * z) / (4 * nn)) / nn);
  return {
    lo: Math.max(0, centre - half),
    hi: Math.min(1, centre + half),
  };
}

export type CalibratedWin = WinScore & {
  probability: number;
  probabilityPct: number;
  interval: { lo: number; hi: number };
  baseRate: number;
  sampleN: number;
  method: string;
};

export function calibrateWin(fit: WinScore, market?: MarketPrior): CalibratedWin {
  const prior = baseRate(market);
  const reasons: Reason[] = [...fit.reasons];
  if (fit.blocking) {
    reasons.push({
      code: 'prob_blocked',
      label: 'Award chance is ~0%',
      status: 'fail',
      detail: 'A hard eligibility gate failed, so a submitted bid would almost certainly be excluded.',
    });
    return {
      ...fit,
      reasons,
      probability: 0,
      probabilityPct: 0,
      interval: { lo: 0, hi: 0.02 },
      baseRate: prior.p0,
      sampleN: prior.n,
      method: 'ineligible',
      disclaimer:
        'This is an award probability for an eligible bid, not a promise. Official rules still decide.',
    };
  }

  let p = prior.p0 * liftFromFit(fit.score);
  p = Math.max(0.005, Math.min(0.45, p));
  const band = wilson(p, prior.n);
  reasons.push({
    code: 'prob_base',
    label: `${Math.round(p * 100)}% award chance`,
    status: 'info',
    detail: `Base rate ${Math.round(prior.p0 * 100)}% (${prior.source}), then adjusted for your fit. 90% interval ${Math.round(band.lo * 100)}–${Math.round(band.hi * 100)}%.`,
  });

  return {
    ...fit,
    reasons,
    probability: p,
    probabilityPct: Math.round(p * 100),
    interval: band,
    baseRate: prior.p0,
    sampleN: prior.n,
    method: market?.meanBidders ? 'awards' : 'sector-prior',
    disclaimer:
      'Probability that a random eligible bidder wins this class of work, adjusted for your profile. Not your personal historical win rate.',
  };
}
