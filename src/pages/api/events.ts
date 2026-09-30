import type { APIRoute } from 'astro';
import { peekEnv, d1Fail } from '../../lib/db.js';
import { getSessionUser } from '../../lib/auth/magic-link.js';
import { hashUser, isEventName, sanitizeProps } from '../../lib/events.js';
import { ensureOpsSchema } from '../../lib/ops-schema.js';

export const prerender = false;

export const POST: APIRoute = async (ctx) => {
  const env = peekEnv(ctx);
  if (!env?.DB) {
    return new Response(JSON.stringify({ ok: false }), { status: 204 });
  }
  let body: any = {};
  try { body = await ctx.request.json(); } catch { body = {}; }
  const name = String(body.name || '');
  if (!isEventName(name)) {
    return new Response(JSON.stringify({ ok: false, error: 'unknown_event' }), { status: 400 });
  }
  let user: any = null;
  try { user = await getSessionUser(env.DB, ctx.request.headers.get('cookie')); } catch {}
  try {
    await ensureOpsSchema(env.DB);
    await env.DB.prepare(
      `INSERT INTO usage_events (name, user_hash, tender_id, props_json, path) VALUES (?,?,?,?,?)`,
    ).bind(
      name,
      hashUser(user?.id ?? null),
      typeof body.tender_id === 'string' ? body.tender_id.slice(0, 40) : null,
      JSON.stringify(sanitizeProps(body.props || {})),
      typeof body.path === 'string' ? body.path.slice(0, 180) : (ctx.request.headers.get('referer') || '').slice(0, 180),
    ).run();
  } catch (err) {
    const fail = d1Fail(err);
    if (fail.body.code === 'd1_quota') {
      return new Response(JSON.stringify({ ok: false, skipped: 'quota' }), { status: 204 });
    }
  }
  return new Response(JSON.stringify({ ok: true }), { headers: { 'content-type': 'application/json' } });
};
