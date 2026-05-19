/**
 * /api/cron/audit
 *
 * Daily coverage audit — sends a summary email via Resend.
 * Does NOT call any LLM (no Gemini, no Groq, no DeepSeek needed here).
 *
 * Fixes applied:
 *  - Removed all GEMINI_API_KEY / GROQ_API_KEY references
 *  - Auth check uses SESSION_SECRET (same as ingest endpoint)
 *  - Graceful handling when Resend key is missing
 */

import type { APIRoute } from 'astro';
import { getDb } from '../../../lib/db.js';

export const prerender = false;

interface AuditRow {
  total_tenders: number;
  active_tenders: number;
  tenders_last_24h: number;
  tenders_last_7d: number;
  sources_active: number;
  last_ingest: string | null;
  last_ingest_status: string | null;
  last_ingest_items: number | null;
}

export const POST: APIRoute = async ({ request, locals }) => {
  // ── Auth ────────────────────────────────────────────────────────────────────
  const secret = request.headers.get('x-cron-secret');
  const env = locals.runtime?.env as Record<string, string | undefined>;

  if (!env?.SESSION_SECRET || secret !== env.SESSION_SECRET) {
    return new Response(JSON.stringify({ error: 'Unauthorised' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const db = getDb(env);
  const started = Date.now();

  try {
    // ── Gather stats ─────────────────────────────────────────────────────────
    const stats = await db
      .prepare(
        `SELECT
           COUNT(*)                                              AS total_tenders,
           SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END)  AS active_tenders,
           SUM(CASE WHEN created_at >= datetime('now', '-1 day')  THEN 1 ELSE 0 END) AS tenders_last_24h,
           SUM(CASE WHEN created_at >= datetime('now', '-7 days') THEN 1 ELSE 0 END) AS tenders_last_7d,
           (SELECT COUNT(DISTINCT source_id) FROM ingestion_runs
            WHERE status = 'success'
            AND started_at >= datetime('now', '-1 day'))        AS sources_active,
           (SELECT started_at FROM ingestion_runs ORDER BY started_at DESC LIMIT 1) AS last_ingest,
           (SELECT status    FROM ingestion_runs ORDER BY started_at DESC LIMIT 1) AS last_ingest_status,
           (SELECT items_new FROM ingestion_runs ORDER BY started_at DESC LIMIT 1) AS last_ingest_items
         FROM tenders`
      )
      .first<AuditRow>();

    // ── Source breakdown ─────────────────────────────────────────────────────
    const sourceRows = await db
      .prepare(
        `SELECT
           s.id,
           s.name,
           COUNT(t.id)   AS tender_count,
           MAX(t.created_at) AS last_seen
         FROM sources s
         LEFT JOIN tenders t ON t.source_id = s.id
         GROUP BY s.id, s.name
         ORDER BY tender_count DESC`
      )
      .all<{ id: string; name: string; tender_count: number; last_seen: string | null }>();

    const duration = Date.now() - started;

    // ── Build email body ─────────────────────────────────────────────────────
    const now = new Date().toISOString();
    const sourceTable = (sourceRows.results ?? [])
      .map(
        (r) =>
          `  ${r.name.padEnd(40)} ${String(r.tender_count).padStart(6)} tenders  last: ${r.last_seen ?? 'never'}`
      )
      .join('\n');

    const emailText = `
Tenderpreneurs — Daily Audit Report
====================================
Generated: ${now}
Duration:  ${duration}ms

OVERVIEW
--------
Total tenders:        ${stats?.total_tenders ?? 0}
Active tenders:       ${stats?.active_tenders ?? 0}
New (last 24h):       ${stats?.tenders_last_24h ?? 0}
New (last 7d):        ${stats?.tenders_last_7d ?? 0}
Sources active (24h): ${stats?.sources_active ?? 0}

LAST INGESTION
--------------
Time:    ${stats?.last_ingest ?? 'never'}
Status:  ${stats?.last_ingest_status ?? 'n/a'}
New:     ${stats?.last_ingest_items ?? 0}

SOURCE BREAKDOWN
----------------
${sourceTable || '  (no sources yet)'}
`.trim();

    // ── Send via Resend ──────────────────────────────────────────────────────
    const resendKey = env?.RESEND_API_KEY;
    let emailStatus = 'skipped — RESEND_API_KEY not set';

    if (resendKey) {
      const emailRes = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${resendKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: 'audit@tenderpreneurs.co.za',
          to: ['mcquir4l@gmail.com'],
          subject: `[Tenderpreneurs] Daily Audit — ${now.split('T')[0]}`,
          text: emailText,
        }),
      });

      emailStatus = emailRes.ok
        ? `sent (${emailRes.status})`
        : `failed (${emailRes.status}: ${await emailRes.text()})`;
    }

    return new Response(
      JSON.stringify({
        ok: true,
        stats,
        source_count: (sourceRows.results ?? []).length,
        email: emailStatus,
        duration_ms: duration,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    console.error('[audit] Error:', err);
    return new Response(
      JSON.stringify({ ok: false, error: String(err), duration_ms: Date.now() - started }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};
