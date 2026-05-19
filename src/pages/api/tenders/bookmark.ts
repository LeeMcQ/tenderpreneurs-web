import type { APIRoute } from "astro";
import { getEnv } from "../../../lib/db";
import { getSessionUser } from "../../../lib/auth/magic-link";

export const prerender = false;

export const POST: APIRoute = async (ctx) => {
  const env = getEnv(ctx);
  const user = await getSessionUser(env.DB, ctx.request.headers.get("cookie"));
  if (!user) {
    return new Response(JSON.stringify({ ok: false, error: "auth_required" }), {
      status: 401, headers: { "content-type": "application/json" },
    });
  }

  let tender_id = "";
  try {
    const body = await ctx.request.json();
    tender_id = String(body.tender_id || "");
  } catch {
    return new Response("invalid_body", { status: 400 });
  }
  if (!/^[0-9A-Z]{26}$/.test(tender_id)) {
    return new Response("invalid_tender_id", { status: 400 });
  }

  // Verify the tender exists
  const t = await env.DB.prepare(`SELECT id FROM tenders WHERE id = ?`).bind(tender_id).first<{ id: string }>();
  if (!t) return new Response("tender_not_found", { status: 404 });

  // Toggle
  const existing = await env.DB.prepare(
    `SELECT 1 FROM bookmarks WHERE user_id = ? AND tender_id = ?`
  ).bind(user.id, tender_id).first();

  if (existing) {
    await env.DB.prepare(
      `DELETE FROM bookmarks WHERE user_id = ? AND tender_id = ?`
    ).bind(user.id, tender_id).run();
    return new Response(JSON.stringify({ ok: true, bookmarked: false }), {
      headers: { "content-type": "application/json" },
    });
  }

  await env.DB.prepare(
    `INSERT INTO bookmarks (user_id, tender_id) VALUES (?, ?)`
  ).bind(user.id, tender_id).run();

  return new Response(JSON.stringify({ ok: true, bookmarked: true }), {
    headers: { "content-type": "application/json" },
  });
};
