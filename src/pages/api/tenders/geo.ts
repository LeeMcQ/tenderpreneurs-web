/**
 * Province counts + town clusters.
 * Cheap GROUP BYs. Cached at the edge.
 */
import type { APIRoute } from 'astro';
import { peekEnv, d1Fail } from '../../../lib/db.js';
import { resolveLocation, PROVINCE_CENTROIDS } from '../../../lib/tender-location.js';

export const prerender = false;

const VALID_SECTORS = new Set([
  'construction','ict','health','education','transport','agriculture',
  'energy','security','consulting','cleaning','catering','legal',
]);

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'public, max-age=300' },
  });
}

export const GET: APIRoute = async (ctx) => {
  const url = new URL(ctx.request.url);
  const sector = url.searchParams.get('sector');
  const q = url.searchParams.get('q');
  const cacheKey = new Request(
    `https://tenderpreneurs.co.za/api/tenders/geo?sector=${sector || ''}&q=${q || ''}`,
    { method: 'GET' },
  );

  try {
    const cache = (globalThis as any).caches?.default;
    if (cache) {
      const hit = await cache.match(cacheKey);
      if (hit) return hit;
    }
  } catch { /* cache optional */ }

  const env = peekEnv(ctx);
  if (!env?.DB) {
    return json({ ok: false, error: 'Tender database is not bound on this deployment.' }, 503);
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
    where.push('(title LIKE ? OR procuring_entity LIKE ? OR briefing_location LIKE ?)');
    const like = `%${q.trim()}%`;
    binds.push(like, like, like);
  }
  const sqlWhere = where.join(' AND ');

  try {
    const [provRows, themeRows] = await Promise.all([
      env.DB.prepare(
        `SELECT COALESCE(province, 'national') AS slug, COUNT(*) AS count
         FROM tenders WHERE ${sqlWhere} GROUP BY 1`,
      ).bind(...binds).all<{ slug: string; count: number }>(),
      env.DB.prepare(
        `SELECT sector AS slug, COUNT(*) AS count
         FROM tenders WHERE ${sqlWhere} AND sector IS NOT NULL AND sector != ''
         GROUP BY sector`,
      ).bind(...binds).all<{ slug: string; count: number }>(),
    ]);

    let placeRows: { province: string | null; sector: string | null; place: string; count: number }[] = [];
    try {
      const rich = await env.DB.prepare(
        `SELECT province, sector,
                COALESCE(NULLIF(trim(locality), ''), briefing_location) AS place,
                COUNT(*) AS count
         FROM tenders
         WHERE ${sqlWhere}
           AND (
             (locality IS NOT NULL AND trim(locality) != '')
             OR (briefing_location IS NOT NULL AND trim(briefing_location) != '')
           )
         GROUP BY province, sector, place
         LIMIT 120`,
      ).bind(...binds).all<{ province: string | null; sector: string | null; place: string; count: number }>();
      placeRows = rich.results ?? [];
    } catch {
      const plain = await env.DB.prepare(
        `SELECT province, sector, briefing_location AS place, COUNT(*) AS count
         FROM tenders
         WHERE ${sqlWhere}
           AND briefing_location IS NOT NULL AND trim(briefing_location) != ''
         GROUP BY province, sector, briefing_location
         LIMIT 80`,
      ).bind(...binds).all<{ province: string | null; sector: string | null; place: string; count: number }>();
      placeRows = plain.results ?? [];
    }

    const provinces = Object.keys(PROVINCE_CENTROIDS).map((slug) => {
      const row = (provRows.results ?? []).find((p) => p.slug === slug);
      return {
        slug,
        name: PROVINCE_CENTROIDS[slug].name,
        count: Number(row?.count ?? 0),
        valueZar: 0,
      };
    }).sort((a, b) => b.count - a.count);

    const themes = (themeRows.results ?? [])
      .map((t) => ({ slug: t.slug, count: Number(t.count ?? 0) }))
      .sort((a, b) => b.count - a.count);

    const townMap = new Map<string, { name: string; province: string | null; lat: number; lng: number; count: number; precision: 'town' | 'metro' | 'province' | 'national' | 'unknown'; sector?: string | null }>();
    for (const row of placeRows) {
      const loc = resolveLocation({
        title: row.place,
        briefing_location: row.place,
        province: row.province,
      });
      if (!loc.town || loc.lat == null || loc.lng == null) continue;
      const key = `${loc.town.toLowerCase()}|${loc.province ?? ''}`;
      const existing = townMap.get(key);
      const n = Number(row.count ?? 0);
      if (existing) {
        existing.count += n;
        if (!existing.sector && row.sector) existing.sector = row.sector;
      } else townMap.set(key, {
        name: loc.town,
        province: loc.province,
        lat: loc.lat,
        lng: loc.lng,
        count: n,
        precision: loc.precision,
        sector: row.sector,
      });
    }

    const res = json({
      ok: true,
      total: provinces.reduce((n, p) => n + p.count, 0),
      provinces,
      towns: [...townMap.values()].sort((a, b) => b.count - a.count),
      themes,
    });

    try {
      const cache = (globalThis as any).caches?.default;
      if (cache) await cache.put(cacheKey, res.clone());
    } catch { /* ignore */ }
    return res;
  } catch (err) {
    console.error('[geo] error:', err);
    const fail = d1Fail(err);
    return json(fail.body, fail.status);
  }
};
