/**
 * src/pages/api/admin/verify-cron.ts
 * POST  (header x-cron-secret: <CRON_SECRET>)
 * Auto-verifies recently imported tenders that have no report yet, queuing
 * drafts for admin review. Idempotent (skips tenders already having a report).
 * Call from GitHub Actions / a scheduled Worker. Cost-capped via ?limit.
 */
import type { APIRoute } from 'astro';
import { getEnv } from '../../../lib/db.js';
import { runVerificationForTender } from '../../../lib/verifier/run.js';

export const prerender = false;

export const POST: APIRoute = async (ctx) => {
  const env = getEnv(ctx);
  const secret = (env as any).CRON_SECRET;
  if (!secret || ctx.request.headers.get('x-cron-secret') !== secret) {
    return json({ ok: false, error: 'unauthorized' }, 401);
  }

  const url = new URL(ctx.request.url);
  const limit = Math.min(Math.max(parseInt(url.searchParams.get('limit') ?? '10', 10) || 10, 1), 25);
  const withEngines = url.searchParams.get('engines') !== 'false';

  try {
    const res = await env.DB.prepare(
      `SELECT t.id FROM tenders t
       LEFT JOIN verification_reports vr ON vr.tender_id = t.id
       WHERE t.canonical_ref IS NULL AND vr.id IS NULL
       ORDER BY t.first_seen_at DESC LIMIT ?`
    ).bind(limit).all<{ id: string }>();
    const ids = (res.results ?? []).map(r => r.id);

    const processed: { id: string; health_score: number }[] = [];
    for (const id of ids) {                 // sequential to cap concurrent model spend
      try {
        const r = await runVerificationForTender(env, id, withEngines);
        if (r) processed.push(r);
      } catch (e) { console.error('[verify-cron] failed for', id, e); }
    }

    return json({ ok: true, requested: limit, found: ids.length, processed: processed.length, reports: processed });
  } catch (err) {
    console.error('[verify-cron] error:', err);
    return json({ ok: false, error: 'internal error' }, 500);
  }
};

function json(b: unknown, s = 200) { return new Response(JSON.stringify(b), { status: s, headers: { 'content-type': 'application/json' } }); }
