import type { APIRoute } from "astro";
import { getEnv } from "../../../../lib/db";
import {
  consumeOAuthState,
  exchangeCodeForUser,
  upsertGoogleUser,
  issueSession,
  sessionCookie,
} from "../../../../lib/auth/google";

export const prerender = false;

export const GET: APIRoute = async (ctx) => {
  const env = getEnv(ctx);
  const url = new URL(ctx.request.url);

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const errorParam = url.searchParams.get("error");

  if (errorParam) return ctx.redirect(`/auth/error?reason=google_${errorParam}`, 303);
  if (!code || !state) return ctx.redirect(`/auth/error?reason=missing_code_or_state`, 303);

  const stateResult = await consumeOAuthState(env.DB, state, "google");
  if (!stateResult.ok) return ctx.redirect(`/auth/error?reason=invalid_state`, 303);

  let profile;
  try {
    const redirectUri = `${env.PUBLIC_SITE_URL}/api/auth/google/callback`;
    profile = await exchangeCodeForUser(
      code,
      env.GOOGLE_CLIENT_ID,
      env.GOOGLE_CLIENT_SECRET,
      redirectUri
    );
  } catch (e) {
    const reason = (e as Error).message.replace(/[^a-z_]/gi, "").slice(0, 40);
    return ctx.redirect(`/auth/error?reason=${reason || "exchange_failed"}`, 303);
  }

  const { userId } = await upsertGoogleUser(env.DB, profile);

  const ttlDays = parseInt(env.SESSION_TTL_DAYS, 10) || 30;
  const sessionId = await issueSession(env.DB, userId, ttlDays, {
    ip: ctx.request.headers.get("cf-connecting-ip") || undefined,
    userAgent: ctx.request.headers.get("user-agent") || undefined,
  });

  // If they came in via a paid plan CTA, send them straight to checkout.
  let destination = stateResult.redirectTo;
  if (stateResult.plan === "pro" || stateResult.plan === "pro_annual") {
    destination = `/api/payments/checkout?plan=${stateResult.plan}`;
  }

  return new Response(null, {
    status: 303,
    headers: {
      location: destination,
      "set-cookie": sessionCookie(sessionId, ttlDays, true),
    },
  });
};
