/**
 * src/pages/api/tenders/[id]/report.ts
 * GET /api/tenders/:id/report  (public)
 * Returns the latest PUBLISHED, admin-approved external report for a tender,
 * flattened to the panel's render shape. { ok, published:false } when none.
 */
import type { APIRoute } from 'astro';
import { getEnv } from '../../../../lib/db.js';

export const prerender = false;

export const GET: APIRoute = async (ctx) => {
  const env = getEnv(ctx);
  const id = ctx.params.id;
  if (!id) return json({ ok: false, error: 'missing id' }, 400);

  try {
    const row = await env.DB.prepare(
      `SELECT external_json, health_score, published_at FROM verification_reports
       WHERE tender_id = ? AND status = 'published'
       ORDER BY published_at DESC LIMIT 1`
    ).bind(id).first<{ external_json: string; health_score: number; published_at: string }>();

    if (!row) return json({ ok: true, published: false });

    const ext = JSON.parse(row.external_json);
    const flags = (ext.sections ?? []).flatMap((s: any) =>
      (s.flaws ?? []).map((f: any) => ({
        category: f.category, severity: f.severity,
        message: f.message, suggested_action: f.suggested_fix, rule_ref: f.rule_ref,
      })));

    return json({
      ok: true, published: true, reviewed: true,
      health_score: row.health_score,
      flags,
      disclaimer: ext.note ?? '',
      framework_version: ext.framework_version ?? '',
      published_at: row.published_at,
    });
  } catch (err) {
    console.error('[report] error:', err);
    return json({ ok: false, error: 'internal error' }, 500);
  }
};

function json(b: unknown, s = 200) {
  return new Response(JSON.stringify(b), { status: s, headers: { 'content-type': 'application/json', 'cache-control': 'public, max-age=900' } });
}
