/**
 * src/pages/api/cron/audit.ts
 *
 * Daily coverage audit — counts rows in D1 and emails a report via Resend.
 *
 * Fix: Removed `import { getDb } from '../../../lib/db.js'` — getDb is not
 * exported by db.ts. Instead we access the D1 binding directly from
 * locals.runtime.env.DB (the Cloudflare D1 binding declared in wrangler.toml).
 * This is the same pattern used by all other API routes in this project.
 *
 * No LLM calls — this endpoint only reads DB stats and sends an email.
 */

import type { APIRoute } from 'astro';

export const prerender = false;

export const POST: APIRoute = async ({ request, locals }) => {
  const env = (locals as any).runtime?.env as Record<string, any> | undefined;

  // ── Auth ──────────────────────────────────────────────────────────────────
  const secret = request.headers.get('x-cron-secret');
  if (!env?.SESSION_SECRET || secret !== env.SESSION_SECRET) {
    return json({ error: 'Unauthorised' }, 401);
  }

  // ── D1 binding ────────────────────────────────────────────────────────────
  const db = env?.DB as D1Database | undefined;
  if (!db) {
    return json({ error: 'D1 binding DB not found in runtime env' }, 500);
  }

  const started = Date.now();

  try {
    // ── Overview stats ───────────────────────────────────────────────────────
    const statsRow = await db
      .prepare(
        `SELECT
           COUNT(*)                                                         AS total_tenders,
           SUM(CASE WHEN status = 'active'              THEN 1 ELSE 0 END) AS active_tenders,
           SUM(CASE WHEN created_at >= datetime('now','-1 day')  THEN 1 ELSE 0 END) AS new_24h,
           SUM(CASE WHEN created_at >= datetime('now','-7 days') THEN 1 ELSE 0 END) AS new_7d
         FROM tenders`
      )
      .first<{ total_tenders: number; active_tenders: number; new_24h: number; new_7d: number }>();

    // ── Last ingestion run ───────────────────────────────────────────────────
    const lastRun = await db
      .prepare(
        `SELECT source_id, status, items_new, started_at, error_message
         FROM ingestion_runs
         ORDER BY started_at DESC LIMIT 1`
      )
      .first<{ source_id: string; status: string; items_new: number; started_at: string; error_message: string | null }>();

    // ── Active sources (last 24h) ────────────────────────────────────────────
    const sourcesActive = await db
      .prepare(
        `SELECT COUNT(DISTINCT source_id) AS n
         FROM ingestion_runs
         WHERE status = 'success' AND started_at >= datetime('now','-1 day')`
      )
      .first<{ n: number }>();

    // ── Per-source breakdown ─────────────────────────────────────────────────
    const { results: sourceRows = [] } = await db
      .prepare(
        `SELECT s.id, s.name,
                COUNT(t.id) AS tender_count,
                MAX(t.created_at) AS last_seen
         FROM sources s
         LEFT JOIN tenders t ON t.source_id = s.id
         GROUP BY s.id, s.name
         ORDER BY tender_count DESC`
      )
      .all<{ id: string; name: string; tender_count: number; last_seen: string | null }>();

    const duration = Date.now() - started;
    const now = new Date().toISOString();

    // ── Build plain-text email ───────────────────────────────────────────────
    const sourceTable = sourceRows
      .map(r => `  ${r.name.padEnd(40)} ${String(r.tender_count).padStart(6)}  last: ${r.last_seen ?? 'never'}`)
      .join('\n');

    const emailText = [
      'Tenderpreneurs — Daily Audit Report',
      '====================================',
      `Generated:  ${now}`,
      `Duration:   ${duration}ms`,
      '',
      'OVERVIEW',
      '--------',
      `Total tenders:        ${statsRow?.total_tenders ?? 0}`,
      `Active tenders:       ${statsRow?.active_tenders ?? 0}`,
      `New (last 24h):       ${statsRow?.new_24h ?? 0}`,
      `New (last 7d):        ${statsRow?.new_7d ?? 0}`,
      `Sources active (24h): ${sourcesActive?.n ?? 0}`,
      '',
      'LAST INGESTION RUN',
      '------------------',
      `Source:  ${lastRun?.source_id ?? 'n/a'}`,
      `Time:    ${lastRun?.started_at ?? 'never'}`,
      `Status:  ${lastRun?.status ?? 'n/a'}`,
      `New:     ${lastRun?.items_new ?? 0}`,
      lastRun?.error_message ? `Error:   ${lastRun.error_message}` : null,
      '',
      'SOURCE BREAKDOWN',
      '----------------',
      sourceTable || '  (no sources yet)',
    ].filter(line => line !== null).join('\n');

    // ── Send via Resend ──────────────────────────────────────────────────────
    const resendKey = env?.RESEND_API_KEY as string | undefined;
    const emailTo   = env?.AUDIT_EMAIL_TO  as string | undefined ?? 'mogulbyte1@gmail.com';
    const emailFrom = env?.AUDIT_EMAIL_FROM as string | undefined ?? 'audit@tenderpreneurs.co.za';
    let emailStatus = 'skipped — RESEND_API_KEY not set';

    if (resendKey) {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${resendKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: emailFrom,
          to: [emailTo],
          subject: `[Tenderpreneurs] Daily Audit — ${now.split('T')[0]}`,
          text: emailText,
        }),
      });

      emailStatus = res.ok
        ? `sent (${res.status})`
        : `failed (${res.status}: ${await res.text().catch(() => '?')})`;
    }

    return json({
      ok: true,
      stats: statsRow,
      sources: sourceRows.length,
      last_run: lastRun,
      email: emailStatus,
      duration_ms: duration,
    }, 200);

  } catch (err) {
    console.error('[audit] Error:', err);
    return json({ ok: false, error: String(err), duration_ms: Date.now() - started }, 500);
  }
};

// ── Helper ─────────────────────────────────────────────────────────────────
function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
