/**
 * src/lib/verifier/orchestrate.ts
 *
 * Multi-model "negotiation" core for the Tender Verifier.
 *
 * Each AI engine (Claude, Gemini, DeepSeek, ChatGPT) independently returns
 * candidate flaws classified into a CONTROLLED taxonomy. This module reconciles
 * them with the deterministic rule output to produce confidence-rated flaws:
 *   - deterministic rule backing  → verified, high confidence (trusted)
 *   - many models agree           → high confidence
 *   - one model alone             → low confidence, flagged for human check
 * This is how we suppress single-model hallucination of fake legislation:
 * a lone unverified legal claim can never reach "high" — it is surfaced to the
 * admin reviewer, never auto-sent. PURE / fully testable.
 */

export type Severity = 'info' | 'warning' | 'critical';
export type FlawCategory = 'legal' | 'process' | 'technical' | 'exploit' | 'anomaly';

/** A finding from one engine, mapped to a controlled code so clustering is exact. */
export interface CandidateFlaw {
  category: FlawCategory;
  code: string;            // controlled, e.g. 'no_preference_system', 'brand_specific_spec'
  severity: Severity;
  message: string;
  suggested_fix: string;
  rule_ref?: string;
}
export interface ModelFlawSet { engine: string; flaws: CandidateFlaw[]; }

export interface ReconciledFlaw {
  category: FlawCategory;
  code: string;
  severity: Severity;
  message: string;
  suggested_fix: string;
  rule_ref: string | null;
  engines: string[];          // AI engines that raised it
  agreement: number;          // count of AI engines (excludes deterministic rules)
  verified: boolean;          // backed by a deterministic rule
  confidence: 'high' | 'medium' | 'low';
  needs_human_check: boolean;
}

const SEV_RANK: Record<Severity, number> = { critical: 3, warning: 2, info: 1 };
function maxSeverity(a: Severity, b: Severity): Severity { return SEV_RANK[a] >= SEV_RANK[b] ? a : b; }

interface Cluster {
  category: FlawCategory; code: string; severity: Severity;
  messages: string[]; fixes: string[]; rule_ref: string | null;
  engines: Set<string>; verified: boolean;
}

/** Deterministic flags arrive as {code, category, severity, message, suggested_action, rule_ref}. */
export interface DeterministicFlaw {
  code: string; category?: FlawCategory; severity: Severity;
  message: string; suggested_fix?: string; rule_ref?: string;
}

export function reconcile(models: ModelFlawSet[], deterministic: DeterministicFlaw[] = []): ReconciledFlaw[] {
  const clusters = new Map<string, Cluster>();

  const ensure = (category: FlawCategory, code: string): Cluster => {
    let c = clusters.get(code);
    if (!c) { c = { category, code, severity: 'info', messages: [], fixes: [], rule_ref: null, engines: new Set(), verified: false }; clusters.set(code, c); }
    return c;
  };

  // Seed with deterministic flags — authoritative.
  for (const d of deterministic) {
    const c = ensure(d.category ?? inferCategory(d.code), d.code);
    c.verified = true;
    c.severity = maxSeverity(c.severity, d.severity);
    if (d.message) c.messages.push(d.message);
    if (d.suggested_fix) c.fixes.push(d.suggested_fix);
    if (d.rule_ref) c.rule_ref = d.rule_ref;
  }

  // Merge model findings.
  for (const m of models) {
    for (const f of m.flaws ?? []) {
      const c = ensure(f.category, f.code);
      c.severity = maxSeverity(c.severity, f.severity);
      c.engines.add(m.engine);
      if (f.message) c.messages.push(f.message);
      if (f.suggested_fix) c.fixes.push(f.suggested_fix);
      if (f.rule_ref && !c.rule_ref) c.rule_ref = f.rule_ref;
    }
  }

  const out: ReconciledFlaw[] = [];
  for (const c of clusters.values()) {
    const agreement = c.engines.size;
    let confidence: 'high' | 'medium' | 'low';
    if (c.verified) confidence = 'high';
    else if (agreement >= 3) confidence = 'high';
    else if (agreement === 2) confidence = 'medium';
    else confidence = 'low';

    const needs_human_check = confidence === 'low';

    out.push({
      category: c.category, code: c.code, severity: c.severity,
      message: pickBest(c.messages),
      suggested_fix: pickBest(c.fixes),
      rule_ref: c.rule_ref,
      engines: [...c.engines],
      agreement, verified: c.verified, confidence, needs_human_check,
    });
  }

  return out.sort((a, b) =>
    Number(b.verified) - Number(a.verified) ||
    SEV_RANK[b.severity] - SEV_RANK[a.severity] ||
    b.agreement - a.agreement);
}

/** Longest non-empty string — a cheap proxy for "most specific". */
function pickBest(arr: string[]): string {
  return arr.filter(Boolean).sort((a, b) => b.length - a.length)[0] ?? '';
}

function inferCategory(code: string): FlawCategory {
  if (/cidb|brand|spec|quantity|scope/.test(code)) return 'technical';
  if (/preference|briefing|window|contact|date/.test(code)) return 'process';
  if (/exploit|favour|tailored|collusion|fronting/.test(code)) return 'exploit';
  if (/peer|anomaly|value/.test(code)) return 'anomaly';
  return 'legal';
}

// ── Report assembly ──────────────────────────────────────────────────────

export interface TenderRef { id: string; source_ref?: string | null; title?: string | null; procuring_entity?: string | null; }
export interface ReportMeta { framework_version: string; disclaimer: string; engines_used: string[]; }

export interface ReportSection { category: FlawCategory; label: string; flaws: ReconciledFlaw[]; }
export interface VerificationReport {
  tender: TenderRef;
  health_score: number;
  generated_at: string;
  sections: ReportSection[];
  counts: { critical: number; warning: number; info: number; needs_human_check: number };
  meta: ReportMeta;
}

const CATEGORY_LABEL: Record<FlawCategory, string> = {
  legal: 'Legal & compliance',
  process: 'Procurement process',
  technical: 'Technical specification',
  exploit: 'Integrity & exploitability',
  anomaly: 'Market comparison',
};

export function healthFromFlaws(flaws: { severity: Severity }[]): number {
  let s = 100;
  for (const f of flaws) s -= f.severity === 'critical' ? 25 : f.severity === 'warning' ? 10 : 2;
  return Math.max(0, Math.min(100, s));
}

export function buildReport(tender: TenderRef, flaws: ReconciledFlaw[], meta: ReportMeta): VerificationReport {
  const order: FlawCategory[] = ['legal', 'process', 'technical', 'exploit', 'anomaly'];
  const sections: ReportSection[] = order
    .map(cat => ({ category: cat, label: CATEGORY_LABEL[cat], flaws: flaws.filter(f => f.category === cat) }))
    .filter(s => s.flaws.length > 0);

  const counts = {
    critical: flaws.filter(f => f.severity === 'critical').length,
    warning: flaws.filter(f => f.severity === 'warning').length,
    info: flaws.filter(f => f.severity === 'info').length,
    needs_human_check: flaws.filter(f => f.needs_human_check).length,
  };

  return {
    tender, health_score: healthFromFlaws(flaws), generated_at: new Date().toISOString(),
    sections, counts, meta,
  };
}

/** External view: drop the model mechanics; keep only confident, constructive findings
 *  suitable to share with a procuring entity. Lone low-confidence claims are withheld. */
export function toExternalReport(report: VerificationReport) {
  const filterFlaw = (f: ReconciledFlaw) => ({
    category: f.category, severity: f.severity, message: f.message, suggested_fix: f.suggested_fix, rule_ref: f.rule_ref,
  });
  return {
    tender: report.tender,
    generated_at: report.generated_at,
    sections: report.sections
      .map(s => ({ category: s.category, label: s.label, flaws: s.flaws.filter(f => f.confidence === 'high').map(filterFlaw) }))
      .filter(s => s.flaws.length > 0),
    note: 'Constructive quality review shared for the procuring entity\'s consideration. ' + report.meta.disclaimer,
    framework_version: report.meta.framework_version,
  };
}
