/**
 * src/pages/api/tenders/search.ts
 * SCHEMA-CORRECT: uses estimated_value, last_seen_at (not value_cents/updated_at).
 */

import type { APIRoute } from 'astro';
import { peekEnv } from '../../../lib/db.js';
import { getSessionUser } from '../../../lib/auth/magic-link.js';
import { GUEST_LIST_LIMIT } from '../../../lib/tender-display.js';
import { resolveLocation } from '../../../lib/tender-location.js';

export const prerender = false;

const VALID_PROVINCES = new Set([
  'eastern-cape','free-state','gauteng','kwazulu-natal','limpopo',
  'mpumalanga','northern-cape','north-west','western-cape','national',
]);
const VALID_SECTORS = new Set([
  'construction','ict','health','education','transport','agriculture',
  'energy','security','consulting','cleaning','catering','legal',
]);
const VALID_WITHIN = new Set([7, 14, 30]);

export const GET: APIRoute = async (ctx) => {
  const env = peekEnv(ctx);
  const url = new URL(ctx.request.url);

  const province = url.searchParams.get('province') ?? null;
  const sector   = url.searchParams.get('sector')   ?? null;
  const locality = url.searchParams.get('locality') ?? null;
  const q        = url.searchParams.get('q')        ?? null;
  const withinParam = parseInt(url.searchParams.get('within') ?? '', 10);
  const within = VALID_WITHIN.has(withinParam) ? withinParam : null;
  const limitParam  = parseInt(url.searchParams.get('limit')  ?? '20', 10);
  const offsetParam = parseInt(url.searchParams.get('offset') ?? '0',  10);

  const limit  = Math.min(Math.max(limitParam, 1), 100);
  const offset = Math.max(offsetParam, 0);

  if (!env?.DB) {
    return new Response(
      JSON.stringify({ ok: false, error: 'Tender database is not bound on this deployment.' }),
      { status: 503, headers: { 'content-type': 'application/json' } },
    );
  }

  let user: any = null;
  try {
    user = await getSessionUser(env.DB, ctx.request.headers.get('cookie'));
  } catch (_) { /* anonymous if session lookup fails */ }
  const effectiveLimit = user ? limit : Math.min(limit, GUEST_LIST_LIMIT);
  const pageOffset = user ? offset : 0;

  const where: string[] = [
    "status = 'open'",
    "canonical_ref IS NULL",
    "(closing_date IS NULL OR date(closing_date) >= date('now'))",
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
  if (within) {
    where.push("closing_date IS NOT NULL AND date(closing_date) <= date('now', ?)");
    binds.push(`+${within} days`);
  }
  if (q && q.trim().length >= 2) {
    where.push("(title LIKE ? OR procuring_entity LIKE ? OR description LIKE ? OR briefing_location LIKE ?)");
    const like = `%${q.trim()}%`;
    binds.push(like, like, like, like);
  }
  if (locality && locality.trim().length >= 2) {
    where.push("(title LIKE ? OR procuring_entity LIKE ? OR description LIKE ? OR briefing_location LIKE ?)");
    const like = `%${locality.trim()}%`;
    binds.push(like, like, like, like);
  }

  const countBinds = [...binds];
  binds.push(effectiveLimit, pageOffset);

  try {
    const [rows, total] = await Promise.all([
      env.DB.prepare(
        `SELECT
           id, source_id, source_ref, source_url,
           title, description, procuring_entity,
           province, sector, category,
           closing_date, closing_time,
           briefing_date, briefing_compulsory, briefing_location,
           cidb_grade, estimated_value, bbbee_required,
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

    const tenders = (rows.results ?? []).map(t => {
      const location = resolveLocation({
        title: t.title as string,
        description: t.description as string | null,
        procuring_entity: t.procuring_entity as string | null,
        briefing_location: t.briefing_location as string | null,
        province: t.province as string | null,
      });
      return {
        ...t,
        value_zar: t.estimated_value != null
          ? Math.round(t.estimated_value as number) / 100
          : null,
        value_cents: t.estimated_value,
        source_link: t.source_url ?? null,
        location,
      };
    });

    return new Response(
      JSON.stringify({
        ok: true,
        authenticated: !!user,
        total: total?.n ?? 0,
        shown: tenders.length,
        tenders,
        gated: !user && (total?.n ?? 0) > GUEST_LIST_LIMIT,
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
