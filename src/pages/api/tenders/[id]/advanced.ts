/**
 * GET /api/tenders/:id/advanced
 * Live Advanced check: rule engine + text loopholes + checklist + editor drafts.
 * Works without LLM keys and without a published admin report.
 */
import type { APIRoute } from 'astro';
import { getEnv } from '../../../../lib/db.js';
import { rateLimit, clientKey, tooMany } from '../../../../lib/rate-limit.js';
import { runRuleChecks, peerAnomaly, CORPUS_META, type VerifyTender, type Flag } from '../../../../lib/verifier/rules.js';
import {
  scanTextFindings, findingsFromFlags, mergeFindings, buildChecklist, readinessScore,
} from '../../../../lib/verifier/advanced.js';

export const prerender = false;

function dayspan(a?: string | null, b?: string | null): number | null {
  if (!a || !b) return null;
  const x = Date.parse(a + 'T00:00:00Z'), y = Date.parse(b + 'T00:00:00Z');
  if (Number.isNaN(x) || Number.isNaN(y)) return null;
  return Math.round((y - x) / 86_400_000);
}

export const GET: APIRoute = async (ctx) => {
  const env = getEnv(ctx);
  const rl = await rateLimit(env, `adv:${clientKey(ctx.request)}`, 30, 60);
  if (!rl.allowed) return tooMany(rl);
  const id = ctx.params.id;
  if (!id) return json({ ok: false, error: 'missing id' }, 400);

  try {
    const t = await env.DB.prepare(
      `SELECT id, source_ref, title, description, category, published_date, closing_date, closing_time,
              briefing_date, briefing_compulsory, cidb_grade, estimated_value,
              preference_system, contact_name, contact_email, contact_phone,
              documents_json, sector, procuring_entity
       FROM tenders WHERE id = ? AND canonical_ref IS NULL`,
    ).bind(id).first<Record<string, any>>();
    if (!t) return json({ ok: false, error: 'tender not found' }, 404);

    let documents_count = 0;
    try {
      const docs = JSON.parse(t.documents_json ?? '[]');
      documents_count = Array.isArray(docs) ? docs.length : 0;
    } catch {}

    const subject: VerifyTender = {
      title: t.title, description: t.description, category: t.category,
      published_date: t.published_date, closing_date: t.closing_date, closing_time: t.closing_time,
      briefing_date: t.briefing_date, briefing_compulsory: t.briefing_compulsory,
      cidb_grade: t.cidb_grade, estimated_value: t.estimated_value, preference_system: t.preference_system,
      contact_name: t.contact_name, contact_email: t.contact_email, contact_phone: t.contact_phone,
      documents_count,
    };

    const ruleFlags = runRuleChecks(subject);
    let peerFlags: Flag[] = [];
    let peerContext: any = { n: 0, median_value: null, median_window: null };
    try {
      const peersRes = await env.DB.prepare(
        `SELECT published_date, closing_date, estimated_value
         FROM tenders
         WHERE canonical_ref IS NULL AND id != ?
           AND sector IS ? AND category IS ?
         ORDER BY first_seen_at DESC LIMIT 200`,
      ).bind(id, t.sector, t.category).all<Record<string, any>>();
      const peers = (peersRes.results ?? []).map((p) => ({
        advertising_days: dayspan(p.published_date, p.closing_date),
        estimated_value: p.estimated_value ?? null,
      }));
      const pa = peerAnomaly(
        { advertising_days: dayspan(t.published_date, t.closing_date), estimated_value: t.estimated_value ?? null },
        peers,
      );
      peerFlags = pa.flags;
      peerContext = pa.context;
    } catch (e) {
      console.error('[advanced] peer step failed:', e);
    }

    const findings = mergeFindings(
      findingsFromFlags([...ruleFlags, ...peerFlags]),
      scanTextFindings(subject),
    );
    const checklist = buildChecklist(subject, findings);
    const readiness = readinessScore(findings, checklist);

    return json({
      ok: true,
      tender: { id: t.id, title: t.title, source_ref: t.source_ref, procuring_entity: t.procuring_entity },
      health_score: readiness,
      readiness_score: readiness,
      findings,
      checklist,
      counts: {
        critical: findings.filter((f) => f.severity === 'critical').length,
        warning: findings.filter((f) => f.severity === 'warning').length,
        info: findings.filter((f) => f.severity === 'info').length,
      },
      peer_context: peerContext,
      framework_version: CORPUS_META.framework_version,
      disclaimer: CORPUS_META.disclaimer,
      note: 'Plain-English review of the published notice. Not legal advice. The Public Procurement Act 2024 is invalid; PPPFA 2000 and PPR 2022 still apply.',
    });
  } catch (err) {
    console.error('[advanced] error:', err);
    return json({ ok: false, error: 'internal error' }, 500);
  }
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'public, max-age=120' },
  });
}
