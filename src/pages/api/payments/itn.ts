// PayFast ITN (Instant Transaction Notification) webhook.
//
// Security layers (all must pass):
//   1. Source IP is in PayFast's allow-list (skipped in sandbox mode).
//   2. MD5 signature on the payload matches our computed signature.
//   3. Server-to-server validation: we POST the payload back to PayFast and
//      expect "VALID" in response.
//   4. Amount in the payload matches the amount on the subscription row.
//
// Idempotency: we de-dupe on pf_payment_id via the unique constraint on payments.

import type { APIRoute } from "astro";
import { getEnv, ulid, now } from "../../../lib/db";
import {
  getMode,
  verifyItnSignature,
  serverValidateItn,
  isPayFastIP,
  getPlan,
} from "../../../lib/payments/payfast";

export const prerender = false;

export const POST: APIRoute = async (ctx) => {
  const env = getEnv(ctx);
  const mode = getMode(env);
  const remoteIp = ctx.request.headers.get("cf-connecting-ip");

  // 1. IP allowlist (live mode only)
  if (!isPayFastIP(remoteIp, mode)) {
    return new Response("forbidden_ip", { status: 403 });
  }

  // 2. Parse the ITN body
  const rawBody = await ctx.request.text();
  const fields: Record<string, string> = {};
  for (const [k, v] of new URLSearchParams(rawBody).entries()) {
    fields[k] = v;
  }

  // 3. Signature
  if (!verifyItnSignature(fields, env.PAYFAST_PASSPHRASE || "")) {
    return new Response("bad_signature", { status: 400 });
  }

  // 4. Server-to-server validation (PayFast tells us "VALID" / "INVALID")
  const valid = await serverValidateItn(fields, mode);
  if (!valid) return new Response("server_validation_failed", { status: 400 });

  // 5. Find the subscription row we created at checkout
  const mPaymentId = fields.m_payment_id;
  const sub = await env.DB
    .prepare(
      `SELECT id, user_id, plan, amount_zar_cents, status FROM subscriptions WHERE m_payment_id = ?`
    )
    .bind(mPaymentId)
    .first<{ id: string; user_id: string; plan: string; amount_zar_cents: number; status: string }>();

  if (!sub) return new Response("unknown_m_payment_id", { status: 404 });

  // 6. Amount sanity check (PayFast sends "amount_gross" as e.g. "299.00")
  const expectedZar = (sub.amount_zar_cents / 100).toFixed(2);
  if (fields.amount_gross && parseFloat(fields.amount_gross).toFixed(2) !== expectedZar) {
    return new Response("amount_mismatch", { status: 400 });
  }

  // 7. Idempotent ledger insert
  try {
    await env.DB
      .prepare(
        `INSERT INTO payments
           (id, user_id, subscription_id, pf_payment_id, m_payment_id,
            amount_zar_cents, payment_status, raw_itn_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        ulid(),
        sub.user_id,
        sub.id,
        fields.pf_payment_id || null,
        mPaymentId,
        sub.amount_zar_cents,
        fields.payment_status || "UNKNOWN",
        JSON.stringify(fields)
      )
      .run();
  } catch (e) {
    // Unique constraint hit → we've already processed this ITN. Acknowledge and exit.
    return new Response("OK", { status: 200 });
  }

  // 8. Update subscription state based on payment_status
  const plan = getPlan(sub.plan);
  const status = fields.payment_status;

  if (status === "COMPLETE") {
    const periodMs = sub.plan === "pro_annual" ? 365 * 86_400_000 : 30 * 86_400_000;
    const periodEnd = new Date(Date.now() + periodMs).toISOString();

    await env.DB
      .prepare(
        `UPDATE subscriptions
         SET status = 'active', payfast_token = COALESCE(?, payfast_token),
             current_period_end = ?, updated_at = ?
         WHERE id = ?`
      )
      .bind(fields.token || null, periodEnd, now(), sub.id)
      .run();

    await env.DB
      .prepare(`UPDATE users SET tier = 'paid' WHERE id = ?`)
      .bind(sub.user_id)
      .run();
  } else if (status === "FAILED" || status === "CANCELLED") {
    await env.DB
      .prepare(
        `UPDATE subscriptions SET status = ?, updated_at = ? WHERE id = ?`
      )
      .bind(status.toLowerCase(), now(), sub.id)
      .run();
  }

  return new Response("OK", { status: 200 });
};
