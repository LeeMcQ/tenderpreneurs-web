/**
 * src/pages/api/subscribe.ts
 * POST { procuring_entity, contact_email, consent:true }
 * Records explicit opt-in consent for an entity to receive verification reports
 * on its own tenders. Populates entity_subscriptions, which the 'send' gate
 * checks. (Email confirmation / double opt-in is part of the gated outbound path.)
 */
import type { APIRoute } from 'astro';
import { getEnv, now } from '../../lib/db.js';
import { normaliseEmail, makeOptOutToken } from '../../lib/subscriptions.js';

export const prerender = false;
const CONSENT_VERSION = 'web-optin-v1';

export const POST: APIRoute = async (ctx) => {
  const env = getEnv(ctx);
  let body: any;
  try { body = await ctx.request.json(); } catch { return json({ ok: false, error: 'bad json' }, 400); }

  const entity = String(body?.procuring_entity ?? '').trim();
  const email = normaliseEmail(body?.contact_email);
  const consent = body?.consent === true;

  if (!entity) return json({ ok: false, error: 'procuring_entity required' }, 400);
  if (!email) return json({ ok: false, error: 'a valid contact_email is required' }, 400);
  if (!consent) return json({ ok: false, error: 'explicit consent is required' }, 400);

  try {
    await env.DB.prepare(
      `INSERT INTO entity_subscriptions (procuring_entity, contact_email, consent_at, consent_form_ref, opted_out_at, created_at)
       VALUES (?, ?, ?, ?, NULL, ?)
       ON CONFLICT(procuring_entity, contact_email) DO UPDATE SET
         consent_at = excluded.consent_at,
         consent_form_ref = excluded.consent_form_ref,
         opted_out_at = NULL`
    ).bind(entity, email, now(), CONSENT_VERSION, now()).run();

    const secret = (env as any).UNSUB_SECRET || (env as any).CRON_SECRET || 'unsub-secret';
    const token = await makeOptOutToken(entity, email, secret);
    const origin = new URL(ctx.request.url).origin;

    return json({ ok: true, subscribed: true, opt_out_url: `${origin}/api/unsubscribe?token=${encodeURIComponent(token)}` });
  } catch (err) {
    console.error('[subscribe] error:', err);
    return json({ ok: false, error: 'internal error' }, 500);
  }
};

function json(b: unknown, s = 200) { return new Response(JSON.stringify(b), { status: s, headers: { 'content-type': 'application/json' } }); }
