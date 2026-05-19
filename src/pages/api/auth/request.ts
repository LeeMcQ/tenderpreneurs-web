import type { APIRoute } from "astro";
import { getEnv } from "../../../lib/db";
import { createMagicToken } from "../../../lib/auth/magic-link";
import { sendEmail, magicLinkEmail } from "../../../lib/email";

export const prerender = false;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export const POST: APIRoute = async (ctx) => {
  const env = getEnv(ctx);
  const contentType = ctx.request.headers.get("content-type") || "";

  let email = "";
  let redirectTo = "/tenders";
  try {
    if (contentType.includes("application/json")) {
      const body = await ctx.request.json();
      email = String(body.email || "").trim().toLowerCase();
      redirectTo = String(body.redirect_to || "/tenders");
    } else {
      const form = await ctx.request.formData();
      email = String(form.get("email") || "").trim().toLowerCase();
      redirectTo = String(form.get("redirect_to") || "/tenders");
    }
  } catch {
    return new Response("invalid_body", { status: 400 });
  }

  if (!EMAIL_RE.test(email) || email.length > 254) {
    return new Response("invalid_email", { status: 400 });
  }
  // Only allow same-origin redirects
  if (!redirectTo.startsWith("/")) redirectTo = "/tenders";

  const ttl = parseInt(env.MAGIC_LINK_TTL_MIN, 10) || 15;
  const { token } = await createMagicToken(env.DB, email, redirectTo, ttl);
  const verifyUrl = `${env.PUBLIC_SITE_URL}/api/auth/verify?token=${token}&r=${encodeURIComponent(redirectTo)}`;

  const { subject, html, text } = magicLinkEmail(verifyUrl);
  await sendEmail({
    apiKey: env.RESEND_API_KEY,
    from: env.AUTH_EMAIL_FROM,
    to: email,
    subject,
    html,
    text,
  });

  // For HTML form submits, redirect to a "check your email" page
  if (!contentType.includes("application/json")) {
    return ctx.redirect(`/auth/check-email?e=${encodeURIComponent(email)}`, 303);
  }
  return new Response(JSON.stringify({ ok: true }), {
    headers: { "content-type": "application/json" },
  });
};
