/**
 * Province counts + town clusters from fields the record actually has.
 * No geocoder. Unnamed tenders sit on the province centroid only.
 */
import type { APIRoute } from 'astro';
import { peekEnv } from '../../../lib/db.js';
import { clusterGeo } from '../../../lib/tender-location.js';

export const prerender = false;

const VALID_SECTORS = new Set([
  'construction','ict','health','education','transport','agriculture',
  'energy','security','consulting','cleaning','catering','legal',
]);

export const GET: APIRoute = async (ctx) => {
  const env = peekEnv(ctx);
  const url = new URL(ctx.request.url);
  const sector = url.searchParams.get('sector');
  const q = url.searchParams.get('q');

  if (!env?.DB) {
    return new Response(
      JSON.stringify({ ok: false, error: 'Tender database is not bound on this deployment.' }),
      { status: 503, headers: { 'content-type': 'application/json' } },
    );
  }

  const where = [
    "status = 'open'",
    'canonical_ref IS NULL',
    "(closing_date IS NULL OR date(closing_date) >= date('now'))",
  ];
  const binds: unknown[] = [];
  if (sector && VALID_SECTORS.has(sector)) {
    where.push('sector = ?');
    binds.push(sector);
  }
  if (q && q.trim().length >= 2) {
    where.push('(title LIKE ? OR procuring_entity LIKE ? OR description LIKE ? OR briefing_location LIKE ?)');
    const like = `%${q.trim()}%`;
    binds.push(like, like, like, like);
  }

  try {
    const rows = await env.DB.prepare(
      `SELECT id, title, description, procuring_entity, briefing_location, province, sector, estimated_value
       FROM tenders
       WHERE ${where.join(' AND ')}
       LIMIT 5000`,
    ).bind(...binds).all<Record<string, unknown>>();

    const geo = clusterGeo((rows.results ?? []) as any);
    const themeMap = new Map<string, number>();
    for (const row of rows.results ?? []) {
      const sectorName = String(row.sector ?? '').trim();
      if (!sectorName) continue;
      themeMap.set(sectorName, (themeMap.get(sectorName) ?? 0) + 1);
    }
    const themes = [...themeMap.entries()]
      .map(([slug, count]) => ({ slug, count }))
      .sort((a, b) => b.count - a.count);
    return new Response(
      JSON.stringify({
        ok: true,
        total: geo.provinces.reduce((n, p) => n + p.count, 0),
        provinces: geo.provinces,
        towns: geo.towns,
        points: geo.points,
        themes,
      }),
      { headers: { 'content-type': 'application/json', 'cache-control': 'public, max-age=120' } },
    );
  } catch (err) {
    console.error('[geo] error:', err);
    return new Response(
      JSON.stringify({ ok: false, error: String(err) }),
      { status: 500, headers: { 'content-type': 'application/json' } },
    );
  }
};
