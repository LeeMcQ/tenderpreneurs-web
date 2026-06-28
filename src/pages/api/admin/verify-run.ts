/**
 * src/pages/api/admin/verify-run.ts
 * POST { tender_id }  (admin only) — run the verifier and store a draft report.
 * Now runs the engine ensemble (Claude + Gemini, or whatever keys are present);
 * degrades to deterministic + data when no keys are configured.
 */
import type { APIRoute } from 'astro';
import { getEnv } from '../../../lib/db.js';
import { getSessionUser } from '../../../lib/auth/magic-link.js';
import { isAdminEmail } from '../../../lib/admin.js';
import { runVerificationForTender } from '../../../lib/verifier/run.js';
import { rateLimit, clientKey, tooMany } from '../../../lib/rate-limit.js';

export const prerender = false;

export const POST: APIRoute = async (ctx) => {
  const env = getEnv(ctx);
  const rl = await rateLimit(env, `verify-run:${clientKey(ctx.request)}`, 30, 60);
  if (!rl.allowed) return tooMany(rl);
  let user: any = null;
  try { user = await getSessionUser(env.DB, ctx.request.headers.get('cookie')); } catch {}
  if (!isAdminEmail(user?.email, env)) return json({ ok: false, error: 'forbidden' }, 403);

  let body: any;
  try { body = await ctx.request.json(); } catch { return json({ ok: false, error: 'bad json' }, 400); }
  if (!body?.tender_id) return json({ ok: false, error: 'tender_id required' }, 400);

  try {
    const res = await runVerificationForTender(env, body.tender_id, true);
    if (!res) return json({ ok: false, error: 'tender not found' }, 404);
    return json({ ok: true, ...res, status: 'draft' });
  } catch (err) {
    console.error('[verify-run] error:', err);
    return json({ ok: false, error: 'internal error' }, 500);
  }
};

function json(b: unknown, s = 200) { return new Response(JSON.stringify(b), { status: s, headers: { 'content-type': 'application/json' } }); }
