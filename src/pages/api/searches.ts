import type { APIRoute } from 'astro';
import { peekEnv, d1Fail, ulid } from '../../lib/db.js';
import { getSessionUser } from '../../lib/auth/magic-link.js';
import { ensureOpsSchema } from '../../lib/ops-schema.js';

export const prerender = false;

const PROVINCES = new Set([
  'eastern-cape','free-state','gauteng','kwazulu-natal','limpopo',
  'mpumalanga','northern-cape','north-west','western-cape','national','',
]);
const SECTORS = new Set([
  'construction','ict','health','education','transport','agriculture',
  'energy','security','consulting','cleaning','catering','legal','',
]);
const CHANNELS = new Set(['email', 'whatsapp']);

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

async function userOf(ctx: Parameters<APIRoute>[0]) {
  const env = peekEnv(ctx);
  if (!env?.DB) return { env: null, user: null as any };
  let user = null;
  try { user = await getSessionUser(env.DB, ctx.request.headers.get('cookie')); } catch {}
  return { env, user };
}

export const GET: APIRoute = async (ctx) => {
  const { env, user } = await userOf(ctx);
  if (!env?.DB) return json({ ok: false, error: 'db_unbound' }, 503);
  if (!user) return json({ ok: false, error: 'auth_required' }, 401);
  try {
    await ensureOpsSchema(env.DB);
    const rows = await env.DB.prepare(
      `SELECT id, label, q, province, sector, within_days, channel, last_sent_at, created_at
       FROM saved_searches WHERE user_id = ? ORDER BY created_at DESC LIMIT 20`,
    ).bind(user.id).all();
    return json({ ok: true, searches: rows.results ?? [] });
  } catch (err) {
    const fail = d1Fail(err);
    return json(fail.body, fail.status);
  }
};

export const POST: APIRoute = async (ctx) => {
  const { env, user } = await userOf(ctx);
  if (!env?.DB) return json({ ok: false, error: 'db_unbound' }, 503);
  if (!user) return json({ ok: false, error: 'auth_required' }, 401);
  let body: any = {};
  try { body = await ctx.request.json(); } catch { body = {}; }
  const province = String(body.province ?? '');
  const sector = String(body.sector ?? '');
  const channel = CHANNELS.has(body.channel) ? body.channel : 'email';
  const within = [3, 7, 14, 30].includes(Number(body.within)) ? Number(body.within) : 7;
  if (!PROVINCES.has(province) || !SECTORS.has(sector)) {
    return json({ ok: false, error: 'bad_filter' }, 400);
  }
  try {
    await ensureOpsSchema(env.DB);
    const id = ulid();
    await env.DB.prepare(
      `INSERT INTO saved_searches (id, user_id, label, q, province, sector, within_days, channel)
       VALUES (?,?,?,?,?,?,?,?)`,
    ).bind(
      id,
      user.id,
      String(body.label || '').slice(0, 80) || null,
      String(body.q || '').slice(0, 80) || null,
      province || null,
      sector || null,
      within,
      channel,
    ).run();
    return json({ ok: true, id });
  } catch (err) {
    const fail = d1Fail(err);
    return json(fail.body, fail.status);
  }
};

export const DELETE: APIRoute = async (ctx) => {
  const { env, user } = await userOf(ctx);
  if (!env?.DB) return json({ ok: false, error: 'db_unbound' }, 503);
  if (!user) return json({ ok: false, error: 'auth_required' }, 401);
  const id = new URL(ctx.request.url).searchParams.get('id') || '';
  if (!id) return json({ ok: false, error: 'missing_id' }, 400);
  try {
    await env.DB.prepare(`DELETE FROM saved_searches WHERE id = ? AND user_id = ?`).bind(id, user.id).run();
    return json({ ok: true });
  } catch (err) {
    const fail = d1Fail(err);
    return json(fail.body, fail.status);
  }
};
