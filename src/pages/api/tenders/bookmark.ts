import type { APIRoute } from "astro";
import { getEnv } from "../../../lib/db";
import { getSessionUser } from "../../../lib/auth/magic-link";

export const prerender = false;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export const POST: APIRoute = async (ctx) => {
  const env = getEnv(ctx);
  const user = await getSessionUser(env.DB, ctx.request.headers.get("cookie"));
  if (!user) return json({ ok: false, error: "auth_required" }, 401);

  let tender_id = "";
  let notes: string | null = null;
  let action = "toggle";
  try {
    const body = await ctx.request.json();
    tender_id = String(body.tender_id || "");
    if (typeof body.notes === "string") notes = body.notes.slice(0, 2000);
    if (body.action === "save" || body.action === "remove" || body.action === "note") action = body.action;
  } catch {
    return json({ ok: false, error: "invalid_body" }, 400);
  }
  if (!/^[0-9A-Z]{26}$/.test(tender_id)) {
    return json({ ok: false, error: "invalid_tender_id" }, 400);
  }

  const t = await env.DB.prepare(`SELECT id FROM tenders WHERE id = ?`).bind(tender_id).first<{ id: string }>();
  if (!t) return json({ ok: false, error: "tender_not_found" }, 404);

  const existing = await env.DB.prepare(
    `SELECT notes FROM bookmarks WHERE user_id = ? AND tender_id = ?`,
  ).bind(user.id, tender_id).first<{ notes: string | null }>();

  if (action === "remove" || (action === "toggle" && existing && notes == null)) {
    if (existing) {
      await env.DB.prepare(`DELETE FROM bookmarks WHERE user_id = ? AND tender_id = ?`)
        .bind(user.id, tender_id).run();
    }
    return json({ ok: true, bookmarked: false, notes: null });
  }

  if (existing) {
    if (notes != null) {
      await env.DB.prepare(
        `UPDATE bookmarks SET notes = ? WHERE user_id = ? AND tender_id = ?`,
      ).bind(notes, user.id, tender_id).run();
    }
    return json({ ok: true, bookmarked: true, notes: notes ?? existing.notes ?? "" });
  }

  await env.DB.prepare(
    `INSERT INTO bookmarks (user_id, tender_id, notes) VALUES (?, ?, ?)`,
  ).bind(user.id, tender_id, notes).run();
  return json({ ok: true, bookmarked: true, notes: notes ?? "" });
};
