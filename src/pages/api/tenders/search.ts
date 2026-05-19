/**
 * src/pages/api/tenders/search.ts
 * SCHEMA-CORRECT: uses estimated_value, last_seen_at (not value_cents/updated_at).
 */

import type { APIRoute } from 'astro';
import { getEnv } from '../../../lib/db.js';
import { getSessionUser } from '../../../lib/auth/magic-link.js';

export const prerender = false;

const VALID_PROVINCES = new Set([
  'eastern-cape','free-state','gauteng','kwazulu-natal','limpopo',
  'mpumalanga','northern-cape','north-west','western-cape','national',
]);
const VALID_SECTORS = new Set([
  'construction','ict','health','education','transport','agriculture',
  'energy','security','consulting','cleaning','catering','legal',
]);

export const GET: APIRoute = async (ctx) => {
  const env = getEnv(ctx);
  const url = new URL(ctx.request.url);

  const province = url.searchParams.get('province') ?? null;
  const sector   = url.searchParams.get('sector')   ?? null;
  const q        = url.searchParams.get('q')        ?? null;
  const limitParam  = parseInt(url.searchParams.get('limit')  ?? '20', 10);
  const offsetParam = parseInt(url.searchParams.get('offset') ?? '0',  10);

  const limit  = Math.min(Math.max(limitParam, 1), 100);
  const offset = Math.max(offsetParam, 0);

  // Anon = max 5 results
  let user: any = null;
  try {
    user = await getSessionUser(env.DB, ctx.request.headers.get('cookie'));
  } catch (_) { /* anonymous if session lookup fails */ }
  const effectiveLimit = user ? limit : Math.min(limit, 5);

  const where: string[] = [
    "status = 'open'",
    "canonical_ref IS NULL",
    "(closing_date IS NULL OR closing_date >= date('now', '-1 day'))",
  ];
  const binds: unknown[] = [];

  if (province && VALID_PROVINCES.has(province)) {
    where.push('province = ?');
    binds.push(province);
  }
  if (sector && VALID_SECTORS.has(sector)) {
    where.push('sector = ?');
    binds.push(sector);
  }
  if (q && q.trim().length >= 2) {
    where.push("(title LIKE ? OR procuring_entity LIKE ?)");
    const like = `%${q.trim()}%`;
    binds.push(like, like);
  }

  const countBinds = [...binds];
  binds.push(effectiveLimit, offset);

  try {
    const [rows, total] = await Promise.all([
      env.DB.prepare(
        `SELECT
           id, source_id, source_ref, source_url,
           title, description, procuring_entity,
           province, sector, category,
           closing_date, closing_time,
           briefing_date, briefing_compulsory,
           cidb_grade, estimated_value,
           first_seen_at, last_seen_at
         FROM tenders
         WHERE ${where.join(' AND ')}
         ORDER BY
           COALESCE(closing_date, '9999-12-31') ASC,
           first_seen_at DESC
         LIMIT ? OFFSET ?`
      ).bind(...binds).all<Record<string, unknown>>(),

      env.DB.prepare(
        `SELECT COUNT(*) AS n FROM tenders WHERE ${where.join(' AND ')}`
      ).bind(...countBinds).first<{ n: number }>(),
    ]);

    const tenders = (rows.results ?? []).map(t => ({
      ...t,
      value_zar: t.estimated_value != null
        ? Math.round(t.estimated_value as number) / 100
        : null,
      // Keep `value_cents` alias for backward compat with the UI
      value_cents: t.estimated_value,
      source_link: t.source_url ?? null,
    }));

    return new Response(
      JSON.stringify({
        ok: true,
        authenticated: !!user,
        total: total?.n ?? 0,
        shown: tenders.length,
        tenders,
        gated: !user && (total?.n ?? 0) > 5,
      }),
      { headers: { 'content-type': 'application/json' } }
    );
  } catch (err) {
    console.error('[search] error:', err);
    return new Response(
      JSON.stringify({ ok: false, error: String(err) }),
      { status: 500, headers: { 'content-type': 'application/json' } }
    );
  }
};
