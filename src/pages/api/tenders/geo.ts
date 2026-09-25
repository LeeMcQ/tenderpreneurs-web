/** One pin per open tender + province/theme counts. Cached at the edge. */
import type { APIRoute } from 'astro';
import { peekEnv, d1Fail } from '../../../lib/db.js';
import { PROVINCE_CENTROIDS } from '../../../lib/tender-location.js';
import { pinFromTender } from '../../../lib/tender-geo-pin.js';

export const prerender = false;

const VALID_SECTORS = new Set([
  'construction','ict','health','education','transport','agriculture',
  'energy','security','consulting','cleaning','catering','legal',
]);

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'public, max-age=180' },
  });
}

export const GET: APIRoute = async (ctx) => {
  const url = new URL(ctx.request.url);
  const sector = url.searchParams.get('sector');
  const q = url.searchParams.get('q');
  const cacheKey = new Request(
    `https://tenderpreneurs.co.za/api/tenders/geo?v=4&sector=${sector || ''}&q=${q || ''}`,
    { method: 'GET' },
  );

  try {
    const cache = (globalThis as any).caches?.default;
    if (cache) {
      const hit = await cache.match(cacheKey);
      if (hit) return hit;
    }
  } catch { /* optional */ }

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

  try {
    const rows = await env.DB.prepare(
      `SELECT id, title, description, procuring_entity, briefing_location, province, sector
       FROM tenders WHERE ${where.join(' AND ')}
       LIMIT 2000`,
    ).bind(...binds).all<any>();

    const pins = [];
    const provCount = new Map<string, number>();
    const themeCount = new Map<string, number>();
    const townCount = new Map<string, { name: string; province: string | null; lat: number; lng: number; count: number; ids: string[] }>();

    for (const row of rows.results ?? []) {
      const pin = pinFromTender(row);
      const slug = row.province && PROVINCE_CENTROIDS[row.province] ? row.province : 'national';
      provCount.set(slug, (provCount.get(slug) ?? 0) + 1);
      if (row.sector) themeCount.set(row.sector, (themeCount.get(row.sector) ?? 0) + 1);
      if (!pin) continue;
      pins.push({
        id: pin.id,
        lat: Math.round(pin.lat * 1e5) / 1e5,
        lng: Math.round(pin.lng * 1e5) / 1e5,
        sector: pin.sector,
        precision: pin.precision,
        label: pin.label,
      });
      if (pin.label && pin.precision !== 'province' && pin.precision !== 'national' && pin.precision !== 'unknown') {
        const key = pin.label.toLowerCase();
        const t = townCount.get(key);
        if (t) {
          t.count += 1;
          if (t.ids.length < 40) t.ids.push(pin.id);
        } else {
          townCount.set(key, {
            name: pin.label.split(',')[0],
            province: slug === 'national' ? null : slug,
            lat: pin.lat,
            lng: pin.lng,
            count: 1,
            ids: [pin.id],
          });
        }
      }
    }

    const provinces = Object.keys(PROVINCE_CENTROIDS).map((slug) => ({
      slug,
      name: PROVINCE_CENTROIDS[slug].name,
      count: provCount.get(slug) ?? 0,
      valueZar: 0,
    })).sort((a, b) => b.count - a.count);

    const res = json({
      ok: true,
      total: pins.length,
      provinces,
      towns: [...townCount.values()].sort((a, b) => b.count - a.count).slice(0, 80),
      themes: [...themeCount.entries()].map(([slug, count]) => ({ slug, count })).sort((a, b) => b.count - a.count),
      pins,
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
