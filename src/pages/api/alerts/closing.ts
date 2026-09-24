import type { APIRoute } from 'astro';
import { getEnv } from '../../../lib/db';
import { getSessionUser } from '../../../lib/auth/magic-link';
import { SECTORS } from '../../../lib/alerts/closing';
import { PROVINCE_LABELS } from '../../../lib/tender-display';

export const prerender = false;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

export const POST: APIRoute = async (ctx) => {
  const env = getEnv(ctx);
  const user = await getSessionUser(env.DB, ctx.request.headers.get('cookie'));
  if (!user) return json({ ok: false, error: 'auth_required' }, 401);

  let province = '';
  let sector = '';
  let within = 7;
  let phone = '';
  try {
    const body = await ctx.request.json();
    province = String(body.province || '').trim();
    sector = String(body.sector || '').trim();
    within = Math.min(30, Math.max(1, Number(body.within) || 7));
    phone = String(body.phone || '').replace(/[^0-9+]/g, '').slice(0, 16);
  } catch {
    return json({ ok: false, error: 'invalid_body' }, 400);
  }

  if (province && !(province in PROVINCE_LABELS)) return json({ ok: false, error: 'bad_province' }, 400);
  if (sector && !(SECTORS as readonly string[]).includes(sector)) return json({ ok: false, error: 'bad_sector' }, 400);

  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS closing_alerts (
       user_id TEXT NOT NULL,
       province TEXT NOT NULL DEFAULT '',
       sector TEXT NOT NULL DEFAULT '',
       within_days INTEGER NOT NULL DEFAULT 7,
       phone TEXT,
       last_sent_at TEXT,
       created_at TEXT NOT NULL DEFAULT (datetime('now')),
       PRIMARY KEY (user_id, province, sector, within_days)
     )`,
  ).run();

  await env.DB.prepare(
    `INSERT INTO closing_alerts (user_id, province, sector, within_days, phone)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(user_id, province, sector, within_days) DO UPDATE SET phone = excluded.phone`,
  ).bind(user.id, province, sector, within, phone || null).run();

  return json({ ok: true, saved: true, province, sector, within, phone: phone || null });
};
