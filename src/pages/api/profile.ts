/**
 * src/pages/api/profile.ts
 * POST /api/profile — save the signed-in user's supplier profile.
 */
import type { APIRoute } from 'astro';
import { getEnv, now } from '../../lib/db.js';
import { getSessionUser } from '../../lib/auth/magic-link.js';
import { normaliseProfileInput, type RawProfileInput } from '../../lib/profile.js';

export const prerender = false;

export const POST: APIRoute = async (ctx) => {
  const env = getEnv(ctx);

  let user: any = null;
  try { user = await getSessionUser(env.DB, ctx.request.headers.get('cookie')); }
  catch { /* anon */ }
  if (!user) return json({ ok: false, error: 'auth required' }, 401);

  let raw: RawProfileInput;
  try { raw = await ctx.request.json(); }
  catch { return json({ ok: false, error: 'invalid JSON body' }, 400); }

  const p = normaliseProfileInput(raw);

  try {
    await env.DB.prepare(
      `CREATE TABLE IF NOT EXISTS supplier_profiles (
         user_id TEXT PRIMARY KEY,
         cidb_grades_json TEXT,
         bbbee_level INTEGER,
         capacity_value_max INTEGER,
         provinces_json TEXT,
         sectors_json TEXT,
         keywords_json TEXT,
         csd_number TEXT,
         jv_visible INTEGER NOT NULL DEFAULT 0,
         updated_at TEXT
       )`,
    ).run();

    await env.DB.prepare(
      `INSERT INTO supplier_profiles
         (user_id, cidb_grades_json, bbbee_level, capacity_value_max,
          provinces_json, sectors_json, keywords_json, csd_number, jv_visible, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(user_id) DO UPDATE SET
         cidb_grades_json=excluded.cidb_grades_json,
         bbbee_level=excluded.bbbee_level,
         capacity_value_max=excluded.capacity_value_max,
         provinces_json=excluded.provinces_json,
         sectors_json=excluded.sectors_json,
         keywords_json=excluded.keywords_json,
         csd_number=excluded.csd_number,
         jv_visible=excluded.jv_visible,
         updated_at=excluded.updated_at`
    ).bind(
      user.id,
      p.cidb_grades_json,
      p.bbbee_level,
      p.capacity_value_max,
      p.provinces_json,
      p.sectors_json,
      p.keywords_json,
      p.csd_number,
      p.jv_visible,
      now(),
    ).run();

    const provinces = JSON.parse(p.provinces_json);
    await env.DB.prepare(
      `UPDATE users SET province = ?, sectors_json = ? WHERE id = ?`
    ).bind(provinces[0] ?? null, p.sectors_json, user.id).run();

    return json({ ok: true, saved: true });
  } catch (err) {
    console.error('[profile] save error:', err);
    return json({ ok: false, error: 'save failed' }, 500);
  }
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}
