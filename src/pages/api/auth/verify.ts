import type { APIRoute } from "astro";
import { getEnv } from "../../../lib/db";
import { consumeMagicToken, sessionCookie } from "../../../lib/auth/magic-link";

export const prerender = false;

export const GET: APIRoute = async (ctx) => {
  const env = getEnv(ctx);
  const url = new URL(ctx.request.url);
  const token = url.searchParams.get("token");
  const fallback = url.searchParams.get("r") || "/tenders";

  if (!token || !/^[a-f0-9]{64}$/.test(token)) {
    return ctx.redirect(`/auth/error?reason=invalid_token`, 303);
  }

  const ttlDays = parseInt(env.SESSION_TTL_DAYS, 10) || 30;
  const result = await consumeMagicToken(env.DB, token, ttlDays, {
    ip: ctx.request.headers.get("cf-connecting-ip") || undefined,
    userAgent: ctx.request.headers.get("user-agent") || undefined,
  });

  if (!result.ok || !result.sessionId) {
    return ctx.redirect(`/auth/error?reason=${result.reason || "unknown"}`, 303);
  }

  const redirectTo = result.redirectTo && result.redirectTo.startsWith("/") ? result.redirectTo : fallback;
  return new Response(null, {
    status: 303,
    headers: {
      location: redirectTo,
      "set-cookie": sessionCookie(result.sessionId, ttlDays, true),
    },
  });
};
