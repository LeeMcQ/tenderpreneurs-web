/**
 * src/pages/api/tenders/[id]/win-score.ts
 * GET /api/tenders/:id/win-score — explainable Win Probability (v1) for the
 * signed-in user's profile. Locked for anon / no-profile. Pure rules; no PII
 * leaves the worker. Uses the shared resolver (single source of truth).
 */
import type { APIRoute } from 'astro';
import { getEnv } from '../../../../lib/db.js';
import { getSessionUser } from '../../../../lib/auth/magic-link.js';
import { resolveWinScore } from '../../../../lib/winscore-resolve.js';

export const prerender = false;

export const GET: APIRoute = async (ctx) => {
  const env = getEnv(ctx);
  const id = ctx.params.id;
  if (!id) return json({ ok: false, error: 'missing id' }, 400);

  let user: any = null;
  try { user = await getSessionUser(env.DB, ctx.request.headers.get('cookie')); }
  catch { /* anonymous */ }

  try {
    const r = await resolveWinScore(env, user?.id ?? null, id);
    if ('error' in r) return json({ ok: false, error: r.error }, 404);
    if (r.locked) return json({ ok: true, locked: true, reason: r.reason });
    return json({ ok: true, locked: false, win: r.win });
  } catch (err) {
    console.error('[win-score] error:', err);
    return json({ ok: false, error: 'internal error' }, 500);
  }
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    // R10: score is personalised and cheap to recompute — never serve a stale
    // score after the user edits their profile.
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
}
