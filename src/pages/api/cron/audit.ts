/**
 * src/pages/api/cron/audit.ts
 * Uses getEnv() from lib/db.ts (consistent with all other API routes).
 */
import type { APIRoute } from 'astro';
import { getEnv, now } from '../../../lib/db.js';

export const prerender = false;

export const POST: APIRoute = async (ctx) => {
  const env = getEnv(ctx);

  const secret = ctx.request.headers.get('x-cron-secret');
  if (!env.SESSION_SECRET || secret !== env.SESSION_SECRET) {
    return json({ error: 'Unauthorised' }, 401);
  }

  const db = env.DB;
  const started = Date.now();

  try {
    const stats = await db.prepare(
      `SELECT
         COUNT(*)                                                            AS total_tenders,
         SUM(CASE WHEN status = 'open'               THEN 1 ELSE 0 END)    AS open_tenders,
         SUM(CASE WHEN first_seen_at >= datetime('now','-1 day')  THEN 1 ELSE 0 END) AS new_24h,
         SUM(CASE WHEN first_seen_at >= datetime('now','-7 days') THEN 1 ELSE 0 END) AS new_7d
       FROM tenders`
    ).first<{ total_tenders: number; open_tenders: number; new_24h: number; new_7d: number }>();

    const lastRun = await db.prepare(
      `SELECT source_id, status, items_found, items_new, started_at, error_message
       FROM ingestion_runs ORDER BY started_at DESC LIMIT 1`
    ).first<any>();

    const { results: sourceRows = [] } = await db.prepare(
      `SELECT s.id, s.name, COUNT(t.id) AS cnt, MAX(t.first_seen_at) AS last_seen
       FROM sources s LEFT JOIN tenders t ON t.source_id = s.id
       GROUP BY s.id, s.name ORDER BY cnt DESC`
    ).all<any>();

    const duration = Date.now() - started;
    const reportDate = now().split('T')[0];

    const emailText = [
      'Tenderpreneurs — Daily Audit',
      '==============================',
      `Date: ${reportDate}  |  Duration: ${duration}ms`,
      '',
      `Total tenders:  ${stats?.total_tenders ?? 0}`,
      `Open tenders:   ${stats?.open_tenders ?? 0}`,
      `New (24h):      ${stats?.new_24h ?? 0}`,
      `New (7d):       ${stats?.new_7d ?? 0}`,
      '',
      'Last ingest run:',
      `  Source:  ${lastRun?.source_id ?? 'n/a'}`,
      `  Status:  ${lastRun?.status ?? 'n/a'}`,
      `  Found:   ${lastRun?.items_found ?? 0}   New: ${lastRun?.items_new ?? 0}`,
      lastRun?.error_message ? `  Error:   ${lastRun.error_message}` : null,
      '',
      'Sources:',
      ...sourceRows.map((r: any) =>
        `  ${String(r.name ?? r.id).padEnd(35)} ${String(r.cnt).padStart(5)}  last: ${r.last_seen ?? 'never'}`
      ),
    ].filter(l => l !== null).join('\n');

    let emailStatus = 'skipped — RESEND_API_KEY not set';
    if (env.RESEND_API_KEY) {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${env.RESEND_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: env.AUDIT_EMAIL_FROM ?? 'audit@tenderpreneurs.co.za',
          to: [env.AUDIT_EMAIL_TO ?? 'mogulbyte1@gmail.com'],
          subject: `[Tenderpreneurs] Audit — ${reportDate}`,
          text: emailText,
        }),
      });
      emailStatus = res.ok ? `sent (${res.status})` : `failed (${res.status})`;
    }

    return json({ ok: true, stats, last_run: lastRun, email: emailStatus, duration_ms: duration }, 200);
  } catch (err) {
    console.error('[audit] Error:', err);
    return json({ ok: false, error: String(err), duration_ms: Date.now() - started }, 500);
  }
};

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status, headers: { 'Content-Type': 'application/json' },
  });
}
