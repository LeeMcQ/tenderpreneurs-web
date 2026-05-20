// Session + subscription helper for Astro pages and API routes.
//
// Usage in an .astro page:
//   const { user, subscription } = await getSession(Astro);
//   if (!user) return Astro.redirect("/auth/login?redirect_to=" + Astro.url.pathname);
//
// Usage to gate Pro features:
//   const { user, subscription } = await getSession(Astro);
//   if (!subscription) return Astro.redirect("/pricing?reason=pro_required");

import type { APIContext } from "astro";
import { getEnv } from "../db";
import { getActiveSubscription } from "../payments/payfast";

const COOKIE_NAME = "tp_session";

export interface SessionUser {
  id: string;
  email: string;
  name?: string | null;
  tier: string;
}

export interface SessionSubscription {
  id: string;
  plan: string;
  status: string;
  current_period_end: string | null;
}

export async function getSession(ctx: APIContext | { request: Request; locals: any }): Promise<{
  user: SessionUser | null;
  subscription: SessionSubscription | null;
}> {
  const env = getEnv(ctx as APIContext);
  const cookieHeader = ctx.request.headers.get("cookie");
  if (!cookieHeader) return { user: null, subscription: null };

  const match = cookieHeader.match(new RegExp(`${COOKIE_NAME}=([a-f0-9]+)`));
  if (!match) return { user: null, subscription: null };

  const row = await env.DB
    .prepare(
      `SELECT u.id, u.email, u.name, u.tier, s.expires_at, s.revoked_at
       FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE s.id = ?`
    )
    .bind(match[1])
    .first<{ id: string; email: string; name: string | null; tier: string; expires_at: string; revoked_at: string | null }>();

  if (!row) return { user: null, subscription: null };
  if (row.revoked_at) return { user: null, subscription: null };
  if (new Date(row.expires_at).getTime() < Date.now()) return { user: null, subscription: null };

  const user: SessionUser = { id: row.id, email: row.email, name: row.name, tier: row.tier };
  const subscription = await getActiveSubscription(env.DB, row.id);
  return { user, subscription };
}

export function requireUser(redirectTo: string): Response {
  return new Response(null, {
    status: 303,
    headers: { location: `/auth/login?redirect_to=${encodeURIComponent(redirectTo)}` },
  });
}
