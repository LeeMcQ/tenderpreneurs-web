import type { APIRoute } from "astro";
import { getEnv } from "../../../../lib/db";
import { createOAuthState, buildGoogleAuthUrl } from "../../../../lib/auth/google";

export const prerender = false;

export const GET: APIRoute = async (ctx) => {
  const env = getEnv(ctx);
  const url = new URL(ctx.request.url);

  let redirectTo = url.searchParams.get("redirect_to") || "/tenders";
  if (!redirectTo.startsWith("/")) redirectTo = "/tenders";

  const plan = url.searchParams.get("plan"); // optional: free | pro | pro_annual

  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) {
    return ctx.redirect(`/auth/error?reason=oauth_not_configured`, 303);
  }

  const state = await createOAuthState(env.DB, "google", redirectTo, plan);
  const redirectUri = `${env.PUBLIC_SITE_URL}/api/auth/google/callback`;
  const authUrl = buildGoogleAuthUrl(env.GOOGLE_CLIENT_ID, redirectUri, state);

  return ctx.redirect(authUrl, 303);
};
