/**
 * src/pages/api/tenders/[id]/verify.ts
 * GET /api/tenders/:id/verify
 *
 * Tender Verifier: deterministic rule checks (authoritative) + peer-anomaly
 * comparison + an OPTIONAL LLM nuance pass. No user PII is sent anywhere
 * (only public tender text + the corpus), so it is POPIA-safe.
 * Degrades gracefully to rules+peers if no LLM key is configured or the call fails.
 */
import type { APIRoute } from 'astro';
import { getEnv } from '../../../../lib/db.js';
import { rateLimit, clientKey, tooMany } from '../../../../lib/rate-limit.js';
import {
  runRuleChecks, peerAnomaly, healthScore, CORPUS_META,
  type VerifyTender, type Flag,
} from '../../../../lib/verifier/rules.js';

export const prerender = false;

function dayspan(a?: string | null, b?: string | null): number | null {
  if (!a || !b) return null;
  const x = Date.parse(a + 'T00:00:00Z'), y = Date.parse(b + 'T00:00:00Z');
  if (Number.isNaN(x) || Number.isNaN(y)) return null;
  return Math.round((y - x) / 86_400_000);
}

export const GET: APIRoute = async (ctx) => {
  const env = getEnv(ctx);
  const rl = await rateLimit(env, `verify:${clientKey(ctx.request)}`, 20, 60);
  if (!rl.allowed) return tooMany(rl);
  const id = ctx.params.id;
  if (!id) return json({ ok: false, error: 'missing id' }, 400);

  try {
    const t = await env.DB.prepare(
      `SELECT title, description, category, published_date, closing_date, closing_time,
              briefing_date, briefing_compulsory, cidb_grade, estimated_value,
              preference_system, contact_name, contact_email, contact_phone,
              documents_json, sector, province
       FROM tenders WHERE id = ? AND canonical_ref IS NULL`
    ).bind(id).first<Record<string, any>>();
    if (!t) return json({ ok: false, error: 'tender not found' }, 404);

    let documents_count = 0;
    try { documents_count = Array.isArray(JSON.parse(t.documents_json ?? '[]')) ? JSON.parse(t.documents_json).length : 0; } catch {}

    const subject: VerifyTender = {
      title: t.title, description: t.description, category: t.category,
      published_date: t.published_date, closing_date: t.closing_date, closing_time: t.closing_time,
      briefing_date: t.briefing_date, briefing_compulsory: t.briefing_compulsory,
      cidb_grade: t.cidb_grade, estimated_value: t.estimated_value, preference_system: t.preference_system,
      contact_name: t.contact_name, contact_email: t.contact_email, contact_phone: t.contact_phone,
      documents_count,
    };

    // 1) Deterministic rule checks (authoritative)
    const ruleFlags = runRuleChecks(subject);

    // 2) Peer-anomaly comparison (same sector + category, open or recent)
    let peerFlags: Flag[] = [];
    let peerContext: any = { n: 0, median_value: null, median_window: null };
    try {
      const peersRes = await env.DB.prepare(
        `SELECT published_date, closing_date, estimated_value
         FROM tenders
         WHERE canonical_ref IS NULL AND id != ?
           AND sector IS ? AND category IS ?
         ORDER BY first_seen_at DESC LIMIT 200`
      ).bind(id, t.sector, t.category).all<Record<string, any>>();
      const peers = (peersRes.results ?? []).map(p => ({
        advertising_days: dayspan(p.published_date, p.closing_date),
        estimated_value: p.estimated_value ?? null,
      }));
      const subjWindow = dayspan(t.published_date, t.closing_date);
      const pa = peerAnomaly({ advertising_days: subjWindow, estimated_value: t.estimated_value ?? null }, peers);
      peerFlags = pa.flags; peerContext = pa.context;
    } catch (e) { console.error('[verify] peer step failed:', e); }

    // 3) Optional LLM nuance pass — no PII, graceful degrade
    let llmFlags: Flag[] = [];
    let llm_used = false;
    try {
      const out = await llmNuancePass(subject, env);
      if (out) { llmFlags = out; llm_used = true; }
    } catch (e) { console.error('[verify] llm step skipped:', e); }

    const flags = [...ruleFlags, ...peerFlags, ...llmFlags];
    return json({
      ok: true,
      health_score: healthScore(flags),
      flags,
      peer_context: peerContext,
      llm_used,
      framework_version: CORPUS_META.framework_version,
      disclaimer: CORPUS_META.disclaimer,
    });
  } catch (err) {
    console.error('[verify] error:', err);
    return json({ ok: false, error: 'internal error' }, 500);
  }
};

/**
 * LLM nuance pass — flags single-supplier-favouring specs / vague-or-unlawful
 * evaluation criteria. Constrained to the corpus; must NOT invent legislation.
 * Returns null when no provider key is set (so the endpoint degrades to rules+peers).
 *
 * NOTE: scaffold. Wire to your available provider (OPENROUTER/GEMINI/GROQ).
 * Validate the JSON shape before trusting it; never surface unparsed model text.
 */
async function llmNuancePass(_subject: VerifyTender, env: any): Promise<Flag[] | null> {
  const key = env.OPENROUTER_API_KEY || env.GEMINI_API_KEY || env.GROQ_API_KEY;
  if (!key) return null; // no key → skip, rules+peers still returned
  // TODO: implement provider call with a strict JSON schema + corpus in the system
  // prompt. Until wired, return null to keep the endpoint deterministic and safe.
  return null;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status, headers: { 'content-type': 'application/json', 'cache-control': 'public, max-age=600' },
  });
}
