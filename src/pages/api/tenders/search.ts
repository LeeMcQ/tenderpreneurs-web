import type { APIRoute } from "astro";
import { getEnv } from "../../../lib/db";
import { getSessionUser } from "../../../lib/auth/magic-link";

export const prerender = false;

const VALID_PROVINCES = new Set([
  "eastern-cape","free-state","gauteng","kwazulu-natal","limpopo",
  "mpumalanga","northern-cape","north-west","western-cape","national",
]);
const VALID_SECTORS = new Set([
  "construction","ict","health","education","transport","agriculture",
  "energy","security","consulting","cleaning","catering","legal",
]);

export const GET: APIRoute = async (ctx) => {
  const env = getEnv(ctx);
  const url = new URL(ctx.request.url);
  const province = url.searchParams.get("province");
  const sector = url.searchParams.get("sector");
  const limitParam = parseInt(url.searchParams.get("limit") || "20", 10);
  const offsetParam = parseInt(url.searchParams.get("offset") || "0", 10);

  const limit = Math.min(Math.max(limitParam, 1), 100);
  const offset = Math.max(offsetParam, 0);

  // Gate: anonymous users get max 5; signed-in get up to `limit`
  const user = await getSessionUser(env.DB, ctx.request.headers.get("cookie"));
  const effectiveLimit = user ? limit : Math.min(limit, 5);

  const where: string[] = [
    "status = 'open'",
    "canonical_ref IS NULL",
    "(closing_date IS NULL OR closing_date >= date('now', '-1 day'))",
  ];
  const binds: any[] = [];

  if (province && VALID_PROVINCES.has(province)) {
    where.push("province = ?");
    binds.push(province);
  }
  if (sector && VALID_SECTORS.has(sector)) {
    where.push("sector = ?");
    binds.push(sector);
  }

  binds.push(effectiveLimit, offset);

  const result = await env.DB.prepare(
    `SELECT id, source_ref, title, procuring_entity, province, sector,
            closing_date, closing_time, briefing_compulsory, cidb_grade
     FROM tenders
     WHERE ${where.join(" AND ")}
     ORDER BY COALESCE(closing_date, '9999-12-31') ASC, first_seen_at DESC
     LIMIT ? OFFSET ?`
  )
    .bind(...binds)
    .all();

  // Total available (for "Showing X of Y" displays)
  const totalBinds = binds.slice(0, -2);
  const total = await env.DB.prepare(
    `SELECT COUNT(*) AS n FROM tenders WHERE ${where.join(" AND ")}`
  )
    .bind(...totalBinds)
    .first<{ n: number }>();

  return new Response(
    JSON.stringify({
      ok: true,
      authenticated: !!user,
      total: total?.n || 0,
      shown: result.results?.length || 0,
      tenders: result.results,
      gated: !user && (total?.n || 0) > 5,
    }),
    { headers: { "content-type": "application/json" } }
  );
};
