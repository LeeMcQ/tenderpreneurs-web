import type { APIRoute } from 'astro';
import { peekEnv, d1Fail, ulid } from '../../lib/db.js';
import { getSessionUser } from '../../lib/auth/magic-link.js';
import { ensureOpsSchema } from '../../lib/ops-schema.js';

export const prerender = false;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

export const GET: APIRoute = async (ctx) => {
  const env = peekEnv(ctx);
  if (!env?.DB) return json({ ok: false, error: 'db_unbound' }, 503);
  let user: any = null;
  try { user = await getSessionUser(env.DB, ctx.request.headers.get('cookie')); } catch {}
  if (!user) return json({ ok: false, error: 'auth_required' }, 401);
  try {
    await ensureOpsSchema(env.DB);
    const rows = await env.DB.prepare(
      `SELECT id, title, updated_at FROM notice_drafts WHERE user_id = ? ORDER BY updated_at DESC LIMIT 20`,
    ).bind(user.id).all();
    return json({ ok: true, drafts: rows.results ?? [] });
  } catch (err) {
    const fail = d1Fail(err);
    return json(fail.body, fail.status);
  }
};

export const POST: APIRoute = async (ctx) => {
  const env = peekEnv(ctx);
  if (!env?.DB) return json({ ok: false, error: 'db_unbound' }, 503);
  let user: any = null;
  try { user = await getSessionUser(env.DB, ctx.request.headers.get('cookie')); } catch {}
  if (!user) return json({ ok: false, error: 'auth_required' }, 401);
  let body: any = {};
  try { body = await ctx.request.json(); } catch { body = {}; }
  const title = String(body.title || '').slice(0, 180);
  const id = String(body.id || ulid()).slice(0, 40);
  try {
    await ensureOpsSchema(env.DB);
    await env.DB.prepare(
      `INSERT INTO notice_drafts (id, user_id, title, body_json, last_review_json, updated_at)
       VALUES (?,?,?,?,?,datetime('now'))
       ON CONFLICT(id) DO UPDATE SET
         title = excluded.title,
         body_json = excluded.body_json,
         last_review_json = excluded.last_review_json,
         updated_at = datetime('now')
       WHERE notice_drafts.user_id = excluded.user_id`,
    ).bind(
      id,
      user.id,
      title || null,
      JSON.stringify(body.body ?? body),
      body.review ? JSON.stringify(body.review).slice(0, 8000) : null,
    ).run();
    return json({ ok: true, id });
  } catch (err) {
    const fail = d1Fail(err);
    return json(fail.body, fail.status);
  }
};
