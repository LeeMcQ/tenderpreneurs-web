import type { APIRoute } from "astro";
import { getEnv } from "../../../lib/db";
import { revokeSession, clearSessionCookie } from "../../../lib/auth/magic-link";

export const prerender = false;

export const POST: APIRoute = async (ctx) => {
  const env = getEnv(ctx);
  await revokeSession(env.DB, ctx.request.headers.get("cookie"));
  return new Response(null, {
    status: 303,
    headers: {
      location: "/",
      "set-cookie": clearSessionCookie(),
    },
  });
};
