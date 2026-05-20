import type { APIRoute } from "astro";
import { getEnv, ulid, now } from "../../../lib/db";
import { getSession } from "../../../lib/auth/session";
import {
  getPlan,
  getMode,
  processUrl,
  generateSignature,
  zarFromCents,
  newMPaymentId,
} from "../../../lib/payments/payfast";

export const prerender = false;

// GET — convenience: come from /pricing?plan=pro_monthly button.
// We render a self-submitting form so the browser POSTs to PayFast.
export const GET: APIRoute = async (ctx) => {
  const env = getEnv(ctx);
  const url = new URL(ctx.request.url);
  const planId = url.searchParams.get("plan") || "pro_monthly";

  // Backwards-compat: accept "pro" as monthly alias.
  const resolvedPlanId = planId === "pro" ? "pro_monthly" : planId;
  const plan = getPlan(resolvedPlanId);
  if (!plan) return ctx.redirect("/pricing?reason=invalid_plan", 303);

  const { user } = await getSession(ctx);
  if (!user) {
    return ctx.redirect(
      `/auth/login?plan=${resolvedPlanId}&redirect_to=/api/payments/checkout%3Fplan=${resolvedPlanId}`,
      303
    );
  }

  const mode = getMode(env);
  const mPaymentId = newMPaymentId(user.id, plan.id);

  // Insert a pending subscription row up-front so ITN can find it.
  const subId = ulid();
  await env.DB
    .prepare(
      `INSERT INTO subscriptions
        (id, user_id, plan, status, amount_zar_cents, billing_cycle, m_payment_id, created_at, updated_at)
       VALUES (?, ?, ?, 'pending', ?, ?, ?, ?, ?)`
    )
    .bind(subId, user.id, plan.id, plan.amount_zar_cents, plan.billing_cycle, mPaymentId, now(), now())
    .run();

  // Build the PayFast form fields in PayFast's documented order.
  const fields: Record<string, string> = {
    merchant_id: env.PAYFAST_MERCHANT_ID,
    merchant_key: env.PAYFAST_MERCHANT_KEY,
    return_url: `${env.PUBLIC_SITE_URL}/payment-success`,
    cancel_url: `${env.PUBLIC_SITE_URL}/payment-cancelled`,
    notify_url: `${env.PUBLIC_SITE_URL}/api/payments/itn`,
    name_first: (user.name || "").split(" ")[0] || "Customer",
    email_address: user.email,
    m_payment_id: mPaymentId,
    amount: zarFromCents(plan.amount_zar_cents),
    item_name: plan.name,
    item_description: `Tenderpreneurs ${plan.billing_cycle} subscription`,
    custom_str1: user.id,
    custom_str2: plan.id,
    subscription_type: "1",
    billing_date: new Date().toISOString().slice(0, 10),
    recurring_amount: zarFromCents(plan.amount_zar_cents),
    frequency: String(plan.frequency),
    cycles: String(plan.cycles),
  };

  fields.signature = generateSignature(fields, env.PAYFAST_PASSPHRASE || "");

  // Render a tiny auto-submit form. We can't 302 with a POST body, so HTML is the standard play.
  const formInputs = Object.entries(fields)
    .map(([k, v]) => `<input type="hidden" name="${k}" value="${escapeHtml(v)}">`)
    .join("\n");

  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Redirecting to PayFast…</title>
<style>body{font-family:system-ui,sans-serif;text-align:center;padding:4rem 1rem;color:#333}</style></head>
<body>
<h1>Redirecting to PayFast…</h1>
<p>If you are not redirected automatically, click the button.</p>
<form id="pf" action="${processUrl(mode)}" method="post">
${formInputs}
<button type="submit">Continue to PayFast</button>
</form>
<script>document.getElementById('pf').submit();</script>
</body></html>`;

  return new Response(html, { headers: { "content-type": "text/html; charset=utf-8" } });
};

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[c] as string));
}
