import type { APIRoute } from 'astro';
import { getEnv } from '../../../lib/db';
import { getSessionUser } from '../../../lib/auth/magic-link';

export const prerender = false;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

async function ensure(db: { prepare: Function }) {
  await db.prepare(
    `CREATE TABLE IF NOT EXISTS bid_packs (
       user_id TEXT NOT NULL,
       tender_id TEXT NOT NULL DEFAULT '',
       codes_json TEXT NOT NULL DEFAULT '[]',
       updated_at TEXT NOT NULL DEFAULT (datetime('now')),
       PRIMARY KEY (user_id, tender_id)
     )`,
  ).run();
}

export const GET: APIRoute = async (ctx) => {
  const env = getEnv(ctx);
  const user = await getSessionUser(env.DB, ctx.request.headers.get('cookie'));
  if (!user) return json({ ok: false, error: 'auth_required' }, 401);
  await ensure(env.DB);
  const tenderId = new URL(ctx.request.url).searchParams.get('tender_id') || '';
  const row = await env.DB.prepare(
    `SELECT codes_json FROM bid_packs WHERE user_id = ? AND tender_id = ?`,
  ).bind(user.id, tenderId).first<{ codes_json: string }>();
  const firm = await env.DB.prepare(
    `SELECT codes_json FROM bid_packs WHERE user_id = ? AND tender_id = ''`,
  ).bind(user.id).first<{ codes_json: string }>();
  return json({
    ok: true,
    codes: parse(row?.codes_json) ?? parse(firm?.codes_json) ?? [],
  });
};

export const POST: APIRoute = async (ctx) => {
  const env = getEnv(ctx);
  const user = await getSessionUser(env.DB, ctx.request.headers.get('cookie'));
  if (!user) return json({ ok: false, error: 'auth_required' }, 401);
  let tender_id = '';
  let codes: string[] = [];
  let reuse = false;
  try {
    const body = await ctx.request.json();
    tender_id = String(body.tender_id || '');
    codes = Array.isArray(body.codes) ? body.codes.map(String).slice(0, 24) : [];
    reuse = body.reuse === true;
  } catch {
    return json({ ok: false, error: 'invalid_body' }, 400);
  }
  await ensure(env.DB);
  if (tender_id) {
    await env.DB.prepare(
      `INSERT INTO bid_packs (user_id, tender_id, codes_json, updated_at)
       VALUES (?, ?, ?, datetime('now'))
       ON CONFLICT(user_id, tender_id) DO UPDATE SET codes_json = excluded.codes_json, updated_at = excluded.updated_at`,
    ).bind(user.id, tender_id, JSON.stringify(codes)).run();
  }
  if (reuse || !tender_id) {
    await env.DB.prepare(
      `INSERT INTO bid_packs (user_id, tender_id, codes_json, updated_at)
       VALUES (?, '', ?, datetime('now'))
       ON CONFLICT(user_id, tender_id) DO UPDATE SET codes_json = excluded.codes_json, updated_at = excluded.updated_at`,
    ).bind(user.id, JSON.stringify(codes)).run();
  }
  return json({ ok: true, codes });
};

function parse(raw?: string | null): string[] | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v.map(String) : null;
  } catch {
    return null;
  }
}
