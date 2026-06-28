/**
 * src/pages/api/unsubscribe.ts
 * GET /api/unsubscribe?token=...  — POPIA opt-out. Verifies the signed token,
 * sets opted_out_at, and returns a simple confirmation page.
 */
import type { APIRoute } from 'astro';
import { getEnv, now } from '../../lib/db.js';
import { verifyOptOutToken } from '../../lib/subscriptions.js';

export const prerender = false;

export const GET: APIRoute = async (ctx) => {
  const env = getEnv(ctx);
  const token = new URL(ctx.request.url).searchParams.get('token') ?? '';
  const secret = (env as any).UNSUB_SECRET || (env as any).CRON_SECRET || 'unsub-secret';

  const decoded = await verifyOptOutToken(token, secret);
  if (!decoded) return html('Invalid or expired unsubscribe link.', 400);

  try {
    await env.DB.prepare(
      `UPDATE entity_subscriptions SET opted_out_at = ?
       WHERE procuring_entity = ? AND contact_email = ?`
    ).bind(now(), decoded.entity, decoded.email).run();
    return html(`You have been unsubscribed. ${escapeHtml(decoded.email)} will no longer receive tender quality reports.`);
  } catch (err) {
    console.error('[unsubscribe] error:', err);
    return html('Something went wrong. Please contact support.', 500);
  }
};

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}
function html(message: string, status = 200): Response {
  return new Response(
    `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
     <title>Unsubscribe — Tenderpreneurs</title>
     <body style="font-family:system-ui;background:#0C1B33;color:#fff;display:grid;place-items:center;height:100vh;margin:0">
     <div style="max-width:480px;padding:2rem;text-align:center">
       <h1 style="color:#F5A623;font-size:1.3rem">Tenderpreneurs</h1>
       <p style="color:#A8BBCF">${message}</p>
     </div></body>`,
    { status, headers: { 'content-type': 'text/html; charset=utf-8' } },
  );
}
