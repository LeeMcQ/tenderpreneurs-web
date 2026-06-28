/**
 * src/pages/api/admin/report-action.ts
 * POST { id, action }  (admin only)
 * Drives the review-queue workflow. The 'send' action is gated by the POPIA
 * compliance switch (env.OUTBOUND_ENABLED) AND a recorded entity consent.
 */
import type { APIRoute } from 'astro';
import { getEnv, now } from '../../../lib/db.js';
import { getSessionUser } from '../../../lib/auth/magic-link.js';
import { isAdminEmail } from '../../../lib/admin.js';
import { nextStatus, type ReportStatus, type ReportAction } from '../../../lib/verifier/workflow.js';

export const prerender = false;

export const POST: APIRoute = async (ctx) => {
  const env = getEnv(ctx);
  let user: any = null;
  try { user = await getSessionUser(env.DB, ctx.request.headers.get('cookie')); } catch {}
  if (!isAdminEmail(user?.email, env)) return json({ ok: false, error: 'forbidden' }, 403);

  let body: any;
  try { body = await ctx.request.json(); } catch { return json({ ok: false, error: 'bad json' }, 400); }
  const { id, action } = body ?? {};
  if (!id || !action) return json({ ok: false, error: 'id and action required' }, 400);

  try {
    const row = await env.DB.prepare(
      `SELECT vr.status, t.procuring_entity FROM verification_reports vr
       JOIN tenders t ON t.id = vr.tender_id WHERE vr.id = ?`
    ).bind(id).first<{ status: string; procuring_entity: string | null }>();
    if (!row) return json({ ok: false, error: 'report not found' }, 404);

    const res = nextStatus(row.status as ReportStatus, action as ReportAction);
    if (!res.ok) return json({ ok: false, error: res.error }, 400);

    // POPIA gate: outbound email requires the global switch AND recorded consent.
    if (res.requires_consent_gate) {
      if (String((env as any).OUTBOUND_ENABLED) !== 'true') {
        return json({ ok: false, error: 'Outbound email is disabled pending POPIA/legal sign-off.' }, 403);
      }
      const consent = await env.DB.prepare(
        `SELECT 1 FROM entity_subscriptions
         WHERE procuring_entity = ? AND consent_at IS NOT NULL AND opted_out_at IS NULL LIMIT 1`
      ).bind(row.procuring_entity).first();
      if (!consent) return json({ ok: false, error: 'No recorded opt-in consent for this entity.' }, 403);
    }

    const stamp =
      res.status === 'approved'  ? ', reviewed_by = ?, reviewed_at = ?' :
      res.status === 'published' ? ', published_at = ?' :
      res.status === 'sent'      ? ', sent_at = ?' : '';
    const binds: unknown[] = [res.status, now()];
    if (res.status === 'approved') binds.push(user.email, now());
    else if (res.status === 'published' || res.status === 'sent') binds.push(now());
    binds.push(id);

    await env.DB.prepare(
      `UPDATE verification_reports SET status = ?, updated_at = ?${stamp} WHERE id = ?`
    ).bind(...binds).run();

    return json({ ok: true, status: res.status });
  } catch (err) {
    console.error('[report-action] error:', err);
    return json({ ok: false, error: 'internal error' }, 500);
  }
};

function json(b: unknown, s = 200) { return new Response(JSON.stringify(b), { status: s, headers: { 'content-type': 'application/json' } }); }
