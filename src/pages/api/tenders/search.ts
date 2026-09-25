/**
 * src/pages/api/tenders/search.ts
 */
import type { APIRoute } from 'astro';
import { peekEnv, d1Fail } from '../../../lib/db.js';
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
const ULID = /^[0-9A-Z]{26}$/;

export const GET: APIRoute = async (ctx) => {
  const env = peekEnv(ctx);
  const url = new URL(ctx.request.url);

  const province = url.searchParams.get('province') ?? null;
  const sector   = url.searchParams.get('sector')   ?? null;
  const locality = url.searchParams.get('locality') ?? null;
  const q        = url.searchParams.get('q')        ?? null;
  const ids = (url.searchParams.get('ids') ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter((s) => ULID.test(s))
    .slice(0, 40);
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
  } catch (_) { /* anonymous */ }
  const effectiveLimit = user ? limit : Math.min(limit, GUEST_LIST_LIMIT);
  const pageOffset = user || ids.length ? offset : 0;

  const where: string[] = [
    "status = 'open'",
    "canonical_ref IS NULL",
    "(closing_date IS NULL OR date(closing_date) >= date('now'))",
  ];
  const binds: unknown[] = [];

  if (ids.length) {
    where.push(`id IN (${ids.map(() => '?').join(',')})`);
    binds.push(...ids);
  }
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
  if (!ids.length && locality && locality.trim().length >= 2) {
    where.push("(title LIKE ? OR procuring_entity LIKE ? OR description LIKE ? OR briefing_location LIKE ?)");
    const like = `%${locality.trim()}%`;
    binds.push(like, like, like, like);
  }

  try {
    let total = 0;
    if (ids.length) {
      total = ids.length;
    } else {
      const counted = await env.DB.prepare(
        `SELECT COUNT(*) AS n FROM tenders WHERE ${where.join(' AND ')}`,
      ).bind(...binds).first<{ n: number }>();
      total = Number(counted?.n ?? 0);
    }

    const rows = await env.DB.prepare(
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
    ).bind(...binds, effectiveLimit, pageOffset).all<Record<string, unknown>>();

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

    const shown = tenders.length;
    const gated = !user && !ids.length && total > GUEST_LIST_LIMIT;

    return new Response(
      JSON.stringify({
        ok: true,
        authenticated: !!user,
        total,
        shown,
        tenders,
        gated,
      }),
      { headers: { 'content-type': 'application/json', 'cache-control': 'public, max-age=60' } }
    );
  } catch (err) {
    console.error('[search] error:', err);
    const fail = d1Fail(err);
    return new Response(JSON.stringify(fail.body), {
      status: fail.status,
      headers: { 'content-type': 'application/json' },
    });
  }
};
