/**
 * Advanced tender check — deterministic, plain-English findings.
 * No LLM required. Guidance only, not legal advice.
 *
 * Framework in force: Constitution s217, PFMA/MFMA, PPPFA 2000,
 * Preferential Procurement Regulations 2022. The Public Procurement
 * Act 28 of 2024 was declared invalid by the Constitutional Court on
 * 17 September 2026 (lack of public participation).
 */
import type { Flag, Severity, VerifyTender } from './rules.ts';

export type AdvancedFinding = {
  id: string;
  category: 'legal' | 'process' | 'technical' | 'exploit' | 'ambiguity';
  severity: Severity;
  title: string;
  problem: string;
  why_it_matters: string;
  suggestion: string;
  rule_ref: string;
  original: string;
  proposed: string;
  source: 'rule' | 'text';
};

export type ChecklistItem = {
  code: string;
  label: string;
  required: boolean;
  found_in_notice: boolean;
  hint: string;
};

const BRAND = /\b(toyota|ford|mercedes|caterpillar|dell|hp|lenovo|microsoft|cisco|samsung|apple|bosch|hilti|komatsu|volvo|isuzu|nissan|canon|xerox|johndeere|john deere)\b/i;
const MUST = /\b(must|shall|mandatory|compulsory|required to)\b/i;
const PPA = /\b(public procurement act(?:\s*28)?(?:\s*of\s*2024)?|ppa\s*2024|procurement act 28)\b/i;
const OR_EQ = /\bor\s+equivalent\b/i;
const FUNC = /\bfunctionality\b/i;
const THRESH = /\b(minimum\s+\d+\s*%|threshold\s+of\s+\d+|score\s+of\s+\d+)\b/i;
const NEGOTIATE = /\b(to be negotiated|price on request|tbd|tba)\b/i;
const SBD = /\bsbd\s*(1|4|6\.1|6\.2|8|9)\b/i;
const CSD = /\b(csd|central supplier database)\b/i;
const TAX = /\b(tax clearance|tax pin|sars pin|tax compliance)\b/i;
const APPEAL = /\b(appeal|object|reconsider|paia|review)\b/i;
const RFQ = /\b(rfq|request for quotation)\b/i;

function blob(t: VerifyTender): string {
  return [t.title, t.description].filter(Boolean).join('\n');
}

function snippet(text: string, re: RegExp, fallback: string): string {
  const m = text.match(re);
  if (!m || m.index == null) return fallback;
  const start = Math.max(0, m.index - 40);
  return text.slice(start, Math.min(text.length, m.index + m[0].length + 80)).replace(/\s+/g, ' ').trim();
}

export function scanTextFindings(t: VerifyTender): AdvancedFinding[] {
  const text = blob(t);
  const lower = text.toLowerCase();
  const out: AdvancedFinding[] = [];

  if (PPA.test(text)) {
    const orig = snippet(text, PPA, 'This notice cites the Public Procurement Act 2024.');
    out.push({
      id: 'ppa_2024_invalid',
      category: 'legal',
      severity: 'critical',
      title: 'Notice cites an Act the Court struck down',
      problem: 'This notice points at the Public Procurement Act 28 of 2024.',
      why_it_matters: 'On 17 September 2026 the Constitutional Court declared that Act invalid because Parliament skipped proper public participation. Awards built on that Act can be reviewed.',
      suggestion: 'Use the old rules that still apply: PFMA or MFMA, the PPPFA of 2000, and the 2022 Preferential Procurement Regulations.',
      rule_ref: 'Premier of the Western Cape v Speaker [2026] ZACC 37 · PPPFA 2000 · PPR 2022',
      original: orig,
      proposed: orig.replace(PPA, 'PPPFA 5 of 2000 and the Preferential Procurement Regulations, 2022'),
      source: 'text',
    });
  }

  if (BRAND.test(text) && !OR_EQ.test(text)) {
    const orig = snippet(text, BRAND, 'A brand name is used in the specification.');
    out.push({
      id: 'brand_specific_spec',
      category: 'technical',
      severity: 'warning',
      title: 'Brand named with no “or equivalent”',
      problem: 'The specification names a brand. That can lock the work to one supplier.',
      why_it_matters: 'A losing bidder can argue the spec was written for one house. Courts have set awards aside when the advertised criteria favoured a single product.',
      suggestion: 'Keep the brand only as an example and add “or equivalent”. Describe what the product must do, not who makes it.',
      rule_ref: 'Constitution s217 · PPPFA (fair, equitable, competitive)',
      original: orig,
      proposed: orig.replace(BRAND, (m) => `${m} or equivalent`),
      source: 'text',
    });
  }

  const compulsoryBrief = t.briefing_compulsory === true || t.briefing_compulsory === 1;
  if (compulsoryBrief && !t.briefing_date) {
    out.push({
      id: 'compulsory_briefing_no_when',
      category: 'process',
      severity: 'critical',
      title: 'Compulsory briefing has no date',
      problem: 'Attendance is compulsory, but the notice does not say when.',
      why_it_matters: 'Bidders who miss a briefing they could not find will be thrown out. That is a ready-made review ground.',
      suggestion: 'Publish the date, time, and exact venue. If it is online, publish the link.',
      rule_ref: 'PAJA s6(2)(c) — procedurally unfair',
      original: 'Compulsory briefing — date and venue not published.',
      proposed: 'Compulsory briefing on [date] at [time] SAST, venue: [street address or meeting link]. Sign the register.',
      source: 'text',
    });
  }

  if (FUNC.test(text) && !THRESH.test(text)) {
    const orig = snippet(text, FUNC, 'Functionality is mentioned.');
    out.push({
      id: 'functionality_threshold_unstated',
      category: 'process',
      severity: 'warning',
      title: 'Functionality with no pass mark',
      problem: 'The notice talks about functionality but does not give a minimum score.',
      why_it_matters: 'If the panel invents a cut-off later, a bidder can say they were scored against a hidden rule.',
      suggestion: 'State the sub-criteria, the weights, and the minimum score before price is opened.',
      rule_ref: 'PPR 2022 · Westinghouse v Eskom (advertised criteria only)',
      original: orig,
      proposed: `${orig} Minimum functionality score: 70/100. Sub-criteria and weights are in the bid document.`,
      source: 'text',
    });
  }

  if (NEGOTIATE.test(text)) {
    const orig = snippet(text, NEGOTIATE, 'Price is left open.');
    out.push({
      id: 'price_to_be_negotiated',
      category: 'ambiguity',
      severity: 'warning',
      title: 'Price left as “to be negotiated”',
      problem: 'The notice does not fix how price will be compared.',
      why_it_matters: 'Without a price formula the 80/20 or 90/10 split can be applied after the fact. That is a common PAJA attack.',
      suggestion: 'Publish a bill or a rate schedule. Say whether prices include VAT. State 80/20 or 90/10.',
      rule_ref: 'PPPFA s2 · PPR 2022 regs 4–5',
      original: orig,
      proposed: orig.replace(NEGOTIATE, 'complete the published price schedule (VAT-inclusive)'),
      source: 'text',
    });
  }

  if (text.length > 80 && !SBD.test(text) && !/returnable/i.test(text)) {
    out.push({
      id: 'sbd_forms_not_referenced',
      category: 'legal',
      severity: 'info',
      title: 'Standard bid forms not listed',
      problem: 'The notice does not name the SBD forms bidders must return.',
      why_it_matters: 'Missing SBD 4 or SBD 9 is a classic non-responsive finding. If the pack is silent, both sides guess.',
      suggestion: 'List SBD 1, 4, 6.1, 8 and 9 (and 6.2 if local content applies).',
      rule_ref: 'National Treasury SBD suite · SCM practice',
      original: 'Returnable documents — not listed on the notice.',
      proposed: 'Returnables: SBD 1, SBD 4, SBD 6.1, SBD 8, SBD 9, CSD report, tax PIN, B-BBEE affidavit or certificate.',
      source: 'text',
    });
  }

  if (text.length > 80 && !CSD.test(text)) {
    out.push({
      id: 'csd_requirement_omitted',
      category: 'legal',
      severity: 'info',
      title: 'CSD registration not mentioned',
      problem: 'The notice does not say bidders must be on the Central Supplier Database.',
      why_it_matters: 'Organs of state must buy from CSD-registered suppliers. Leaving it off the advert creates avoidable disqualifications.',
      suggestion: 'Add: “Bidder must be registered on the National Treasury CSD. Attach the CSD summary.”',
      rule_ref: 'National Treasury CSD instruction notes',
      original: 'CSD registration — not stated.',
      proposed: 'The bidder must be registered on the Central Supplier Database (CSD). Attach a current CSD summary report.',
      source: 'text',
    });
  }

  if (text.length > 80 && !TAX.test(text)) {
    out.push({
      id: 'tax_compliance_omitted',
      category: 'legal',
      severity: 'info',
      title: 'Tax compliance not mentioned',
      problem: 'No tax PIN or tax-compliance wording appears on the notice.',
      why_it_matters: 'Awards to non-compliant suppliers are irregular expenditure. Bidders also get caught by an expired PIN on closing day.',
      suggestion: 'Require a valid SARS tax PIN and say it will be checked on closing day.',
      rule_ref: 'PFMA · Treasury tax-compliance instructions',
      original: 'Tax compliance — not stated.',
      proposed: 'Submit a valid SARS tax compliance PIN. Status will be verified on the closing date.',
      source: 'text',
    });
  }

  if (text.length > 200 && !APPEAL.test(text)) {
    out.push({
      id: 'appeal_rights_absent',
      category: 'legal',
      severity: 'info',
      title: 'No objection path is published',
      problem: 'The notice does not tell an unsuccessful bidder how to object.',
      why_it_matters: 'PAJA expects reasons and a fair process. Silence pushes disputes straight to court.',
      suggestion: 'Name the SCM official, the window (usually 10–14 days), and where to send the objection.',
      rule_ref: 'PAJA s3 and s5 · common SCM policy',
      original: 'Objection / appeal process — not published.',
      proposed: 'Unsuccessful bidders may lodge a written objection with SCM within 10 days of the award notice, addressed to the published contact.',
      source: 'text',
    });
  }

  if (RFQ.test(text) && (t.estimated_value ?? 0) > 1_000_000_00) {
    out.push({
      id: 'rfq_above_quotation_band',
      category: 'exploit',
      severity: 'warning',
      title: 'RFQ used on a large contract',
      problem: 'This is framed as a quotation (RFQ) but the value looks like a competitive bid.',
      why_it_matters: 'Using an RFQ to dodge an open bid is a regular irregular-expenditure finding and a review ground.',
      suggestion: 'If the value is above the entity’s quotation limit, advertise as an open bid with the right preference system.',
      rule_ref: 'PFMA/MFMA SCM thresholds · irregular expenditure',
      original: snippet(text, RFQ, 'RFQ'),
      proposed: 'Advertise as an open competitive bid under the PPPFA. Use 80/20 up to R50 million, 90/10 above that.',
      source: 'text',
    });
  }

  if (/\bonly\s+(registered|approved|authorised|authorized)\b/i.test(text) || /\bsole\s+(supplier|agent|distributor)\b/i.test(lower)) {
    out.push({
      id: 'tailored_eligibility',
      category: 'exploit',
      severity: 'warning',
      title: 'Eligibility looks narrowed to one club',
      problem: 'The notice limits who may bid in a way that can fit one supplier.',
      why_it_matters: 'Tailored pre-qualification is a classic challenge. Afribusiness and later cases turned on hidden or extra gates.',
      suggestion: 'If a licence is truly required, cite the law. Do not add extra clubs that the statute does not demand.',
      rule_ref: 'Constitution s217 · PPPFA · PAJA rationality',
      original: snippet(text, /\b(only registered|sole supplier|sole agent|authorised dealer|authorized dealer)\b/i, 'Eligibility is narrowed.'),
      proposed: 'Any bidder who meets the published mandatory criteria and holds the legally required licence may submit.',
      source: 'text',
    });
  }

  if (MUST.test(text) && text.length < 180) {
    out.push({
      id: 'under_specification',
      category: 'ambiguity',
      severity: 'info',
      title: 'Scope is thin for a “must” tender',
      problem: 'The notice uses mandatory language but says very little about the work.',
      why_it_matters: 'Thin specs let the evaluation committee fill gaps after closing. That is how scoring fights start.',
      suggestion: 'Attach a scope, quantities, and acceptance tests. Every “must” should point at a measurable item.',
      rule_ref: 'good practice · s217 competitiveness',
      original: text.slice(0, 220),
      proposed: 'Publish a short scope of work, quantities or hours, delivery site, and how completion will be measured.',
      source: 'text',
    });
  }

  return out;
}

export function findingsFromFlags(flags: Flag[]): AdvancedFinding[] {
  return flags.map((f) => ({
    id: f.id,
    category: (['legal', 'process', 'technical', 'exploit', 'ambiguity'].includes(f.category)
      ? f.category
      : 'process') as AdvancedFinding['category'],
    severity: f.severity,
    title: f.message.replace(/\.$/, ''),
    problem: f.message,
    why_it_matters: 'This is a gap that losing bidders and auditors look for first.',
    suggestion: f.suggested_action,
    rule_ref: f.rule_ref,
    original: f.message,
    proposed: f.suggested_action,
    source: 'rule' as const,
  }));
}

export function mergeFindings(rule: AdvancedFinding[], text: AdvancedFinding[]): AdvancedFinding[] {
  const seen = new Set<string>();
  const out: AdvancedFinding[] = [];
  for (const f of [...rule, ...text]) {
    if (seen.has(f.id)) continue;
    seen.add(f.id);
    out.push(f);
  }
  const rank: Record<Severity, number> = { critical: 3, warning: 2, info: 1 };
  return out.sort((a, b) => rank[b.severity] - rank[a.severity]);
}

const BASE_CHECKLIST: ChecklistItem[] = [
  { code: 'CSD', label: 'CSD summary report', required: true, found_in_notice: false, hint: 'Print the current CSD report the day you submit.' },
  { code: 'TCS', label: 'SARS tax compliance PIN', required: true, found_in_notice: false, hint: 'PIN must still be valid on closing day.' },
  { code: 'BBBEE', label: 'B-BBEE certificate or EME/QSE affidavit', required: true, found_in_notice: false, hint: 'Affidavit is enough for most EMEs and QSEs.' },
  { code: 'CIPC', label: 'CIPC company registration', required: true, found_in_notice: false, hint: 'Match the name on CSD and the bid forms.' },
  { code: 'SBD1', label: 'SBD 1 Invitation to bid', required: true, found_in_notice: false, hint: 'Sign it. An unsigned SBD 1 is often fatal.' },
  { code: 'SBD4', label: 'SBD 4 Declaration of interest', required: true, found_in_notice: false, hint: 'Declare every related party. Blank forms get rejected.' },
  { code: 'SBD61', label: 'SBD 6.1 Preference points', required: true, found_in_notice: false, hint: 'This is how B-BBEE points are claimed.' },
  { code: 'SBD8', label: 'SBD 8 Past SCM practices', required: true, found_in_notice: false, hint: 'Still required on many packs even when Treasury updates forms.' },
  { code: 'SBD9', label: 'SBD 9 Independent bid determination', required: true, found_in_notice: false, hint: 'Do not copy another bidder’s price page.' },
  { code: 'CIDB', label: 'CIDB registration (if construction)', required: false, found_in_notice: false, hint: 'Only when the work is construction or engineering.' },
  { code: 'BRIEF', label: 'Compulsory briefing attendance register', required: false, found_in_notice: false, hint: 'If the briefing is compulsory, no register = no bid.' },
  { code: 'BOQ', label: 'Completed price schedule / BOQ', required: true, found_in_notice: false, hint: 'Do not change quantities. Fill every line.' },
];

export function buildChecklist(t: VerifyTender, findings: AdvancedFinding[]): ChecklistItem[] {
  const text = blob(t).toLowerCase();
  const construction = t.category === 'construction' || /construction|civil|road|refurbish/.test(text);
  const compulsory = t.briefing_compulsory === true || t.briefing_compulsory === 1;
  const findingIds = new Set(findings.map((f) => f.id));

  return BASE_CHECKLIST.map((item) => {
    const row = { ...item };
    if (item.code === 'CIDB') row.required = construction;
    if (item.code === 'BRIEF') row.required = compulsory;
    if (item.code === 'CSD') row.found_in_notice = /\bcsd|central supplier/.test(text);
    if (item.code === 'TCS') row.found_in_notice = /tax/.test(text);
    if (item.code === 'BBBEE') row.found_in_notice = /b-?bb?ee|broad-based/.test(text);
    if (item.code === 'SBD1') row.found_in_notice = /sbd\s*1/.test(text);
    if (item.code === 'SBD4') row.found_in_notice = /sbd\s*4/.test(text);
    if (item.code === 'SBD61') row.found_in_notice = /sbd\s*6\.1/.test(text);
    if (item.code === 'SBD8') row.found_in_notice = /sbd\s*8/.test(text);
    if (item.code === 'SBD9') row.found_in_notice = /sbd\s*9/.test(text);
    if (item.code === 'CIDB') row.found_in_notice = !!t.cidb_grade || /cidb/.test(text);
    if (item.code === 'BRIEF') row.found_in_notice = !!t.briefing_date;
    if (item.code === 'BOQ') row.found_in_notice = /bill of quant|price schedule|pricing schedule/.test(text);
    if (findingIds.has('csd_requirement_omitted') && item.code === 'CSD') row.found_in_notice = false;
    if (findingIds.has('tax_compliance_omitted') && item.code === 'TCS') row.found_in_notice = false;
    return row;
  }).filter((item) => item.required || item.found_in_notice || item.code === 'CIDB' && construction);
}

export function readinessScore(findings: AdvancedFinding[], checklist: ChecklistItem[]): number {
  let s = 100;
  for (const f of findings) s -= f.severity === 'critical' ? 18 : f.severity === 'warning' ? 8 : 3;
  const need = checklist.filter((c) => c.required);
  if (need.length) {
    const missing = need.filter((c) => !c.found_in_notice).length;
    s -= Math.round((missing / need.length) * 12);
  }
  return Math.max(0, Math.min(100, s));
}
