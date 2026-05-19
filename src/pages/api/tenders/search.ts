/**
 * src/pages/api/tenders/search.ts
 *
 * Fixes:
 *  - Column names aligned to real D1 schema:
 *    source_ref (not external_id), procuring_entity (not buyer),
 *    first_seen_at (correct), canonical_ref (correct),
 *    status = 'open' (correct — ingest now maps 'active' → 'open')
 *  - Added source_id to SELECT so client can build source links
 *  - Kept auth gate: anonymous = max 5 results
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

  const province  = url.searchParams.get('province')  ?? null;
  const sector    = url.searchParams.get('sector')    ?? null;
  const q         = url.searchParams.get('q')         ?? null;
  const limitParam  = parseInt(url.searchParams.get('limit')  ?? '20', 10);
  const offsetParam = parseInt(url.searchParams.get('offset') ?? '0',  10);

  const limit  = Math.min(Math.max(limitParam,  1), 100);
  const offset = Math.max(offsetParam, 0);

  // Gate: anon = max 5 results
  const user = await getSessionUser(
    env.DB,
    ctx.request.headers.get('cookie')
  );
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

  const [rows, total] = await Promise.all([
    env.DB.prepare(
      `SELECT
         id, source_id, source_ref, source_url,
         title, summary, procuring_entity,
         province, sector, procurement_type,
         closing_date, closing_time,
         briefing_date, briefing_compulsory,
         cidb_grade, value_cents,
         first_seen_at, updated_at
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
    // Convert cents → ZAR for the client
    value_zar: t.value_cents != null
      ? Math.round(t.value_cents as number) / 100
      : null,
    // Convenience: source link
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
};
