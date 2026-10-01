/**
 * POST /api/tenders/review-draft
 * Review a notice that is not yet on eTenders.
 */
import type { APIRoute } from 'astro';
import { getEnv } from '../../../lib/db.js';
import { rateLimit, clientKey, tooMany } from '../../../lib/rate-limit.js';
import { runRuleChecks, CORPUS_META, type VerifyTender } from '../../../lib/verifier/rules.js';
import {
  scanTextFindings, findingsFromFlags, mergeFindings, buildChecklist, readinessScore,
} from '../../../lib/verifier/advanced.js';

export const prerender = false;

export const POST: APIRoute = async (ctx) => {
  const env = getEnv(ctx);
  const rl = await rateLimit(env, `draft-review:${clientKey(ctx.request)}`, 20, 60);
  if (!rl.allowed) return tooMany(rl);

  let body: any;
  try {
    body = await ctx.request.json();
  } catch {
    return json({ ok: false, error: 'Invalid JSON' }, 400);
  }

  const subject: VerifyTender = {
    title: String(body.title ?? '').slice(0, 400),
    description: String(body.description ?? body.text ?? '').slice(0, 12000),
    category: body.category ?? null,
    published_date: body.published_date ?? body.openingDate ?? null,
    closing_date: body.closing_date ?? body.closingDate ?? null,
    closing_time: body.closing_time ?? body.closingTime ?? null,
    briefing_date: body.briefing_date ?? body.briefingDate ?? null,
    briefing_compulsory: Boolean(body.briefing_compulsory ?? body.briefingCompulsory),
    cidb_grade: body.cidb_grade ?? body.cidb ?? null,
    estimated_value: body.estimated_value ?? body.value ?? null,
    preference_system: body.preference_system ?? null,
    contact_name: body.contact_name ?? body.contactName ?? null,
    contact_email: body.contact_email ?? body.contactEmail ?? null,
    contact_phone: body.contact_phone ?? body.contactPhone ?? null,
    documents_count: Number(body.documents_count ?? 0) || 0,
  };

  if (!subject.title && !subject.description) {
    return json({ ok: false, error: 'Paste a title or the draft notice text.' }, 400);
  }

  const extra: ReturnType<typeof scanTextFindings> = [];
  const blob = `${subject.title}\n${subject.description}`.toLowerCase();
  if (body.source_url) {
    extra.push({
      id: 'source-link',
      severity: 'info',
      message: 'A published link was given. We review the text you pasted, not the live page (avoids fetching third-party sites). Paste the notice wording so gaps and loopholes can be checked.',
      suggested_action: 'Copy the invitation to bid into the text box, then run review again.',
    } as any);
  }
  if (/\bor equivalent\b/.test(blob) === false && /\bbrand\b|\bmake\b|\bmodel\b/.test(blob)) {
    extra.push({
      id: 'brand-lock',
      severity: 'warning',
      message: 'Brand or model language without or equivalent can be challenged as an unfair specification.',
      suggested_action: 'Name the performance required, or add or equivalent with measurable criteria.',
    } as any);
  }
  if (/\bat our discretion\b|\bas and when required\b|\bto be advised\b/.test(blob)) {
    extra.push({
      id: 'open-ended',
      severity: 'warning',
      message: 'Open-ended phrases let a bidder price a loophole or later claim variation.',
      suggested_action: 'Replace with a quantity, period, or measurable deliverable.',
    } as any);
  }
  if (subject.briefing_compulsory && !subject.briefing_date) {
    extra.push({
      id: 'briefing-gate',
      severity: 'critical',
      message: 'Compulsory briefing is marked but no date is set. Bidders will miss the gate or the notice will be set aside.',
      suggested_action: 'Publish date, time, venue, and whether attendance is compulsory.',
    } as any);
  }

  const findings = mergeFindings(
    findingsFromFlags(runRuleChecks(subject)),
    [...scanTextFindings(subject), ...extra] as any,
  );
  const checklist = buildChecklist(subject, findings);
  const readiness = readinessScore(findings, checklist);

  return json({
    ok: true,
    health_score: readiness,
    readiness_score: readiness,
    findings,
    checklist,
    counts: {
      critical: findings.filter((f) => f.severity === 'critical').length,
      warning: findings.filter((f) => f.severity === 'warning').length,
      info: findings.filter((f) => f.severity === 'info').length,
    },
    framework_version: CORPUS_META.framework_version,
    note: 'Pre-publish review of your draft. Not legal advice. Fix gaps before you advertise on eTenders.',
    disclaimer: CORPUS_META.disclaimer,
  });
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}
