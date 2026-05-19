/**
 * src/pages/api/cron/ingest.ts
 *
 * Triggered every 6h by GitHub Actions (x-cron-secret auth).
 * Loops over all registered adapters, fetches raw tenders,
 * upserts into D1, and logs an ingestion_run row.
 *
 * Uses D1 binding (env.DB) directly — no import from lib/db.ts needed.
 */

import type { APIRoute } from 'astro';
import { getAllAdapters } from '../../../lib/adapters/index.js';

export const prerender = false;

export const POST: APIRoute = async ({ request, locals }) => {
  const env = (locals as any).runtime?.env as Record<string, any> | undefined;

  // ── Auth ──────────────────────────────────────────────────────────────────
  const secret = request.headers.get('x-cron-secret');
  if (!env?.SESSION_SECRET || secret !== env.SESSION_SECRET) {
    return json({ error: 'Unauthorised' }, 401);
  }

  const db = env?.DB as D1Database | undefined;
  if (!db) {
    return json({ error: 'D1 binding DB not found in runtime env' }, 500);
  }

  const adapters = getAllAdapters();
  const results: Record<string, unknown> = {};
  const globalStart = Date.now();

  for (const adapter of adapters) {
    const adapterStart = Date.now();
    let itemsFound = 0;
    let itemsNew = 0;
    let errorMessage: string | null = null;

    try {
      const tenders = await adapter.fetch();
      itemsFound = tenders.length;

      for (const t of tenders) {
        // Upsert — on conflict (source_id, external_id) update mutable fields
        const result = await db
          .prepare(
            `INSERT INTO tenders
               (source_id, external_id, title, description, buyer, province,
                sector, status, closing_date, opening_date, value, currency,
                procurement_method, document_urls, source_url, raw_json,
                contact_name, contact_email, contact_phone,
                briefing_date, briefing_venue, briefing_compulsory)
             VALUES
               (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
             ON CONFLICT(source_id, external_id) DO UPDATE SET
               title              = excluded.title,
               description        = excluded.description,
               buyer              = excluded.buyer,
               status             = excluded.status,
               closing_date       = excluded.closing_date,
               value              = excluded.value,
               raw_json           = excluded.raw_json,
               updated_at         = CURRENT_TIMESTAMP`
          )
          .bind(
            t.sourceId,
            t.externalId,
            t.title,
            t.description ?? '',
            t.buyer ?? '',
            t.province ?? 'national',
            t.sector ?? 'General',
            t.status ?? 'active',
            t.closingDate ?? null,
            t.openingDate ?? null,
            t.value ?? null,
            t.currency ?? 'ZAR',
            t.procurementMethod ?? null,
            JSON.stringify(t.documentUrls ?? []),
            t.sourceUrl ?? null,
            t.rawJson ?? null,
            (t as any).contactName ?? null,
            (t as any).contactEmail ?? null,
            (t as any).contactPhone ?? null,
            (t as any).briefingDate ?? null,
            (t as any).briefingVenue ?? null,
            (t as any).briefingCompulsory ? 1 : 0,
          )
          .run();

        // D1 meta: rows_written === 1 means INSERT (not UPDATE)
        if (result.meta?.rows_written === 1) itemsNew++;
      }

    } catch (err) {
      errorMessage = String(err);
      console.error(`[ingest] ${adapter.sourceId} error:`, err);
    }

    const duration = Date.now() - adapterStart;

    // Log ingestion run
    try {
      await db
        .prepare(
          `INSERT INTO ingestion_runs
             (source_id, status, items_found, items_new, error_message, duration_ms)
           VALUES (?, ?, ?, ?, ?, ?)`
        )
        .bind(
          adapter.sourceId,
          errorMessage ? 'error' : 'success',
          itemsFound,
          itemsNew,
          errorMessage,
          duration,
        )
        .run();
    } catch (logErr) {
      console.error(`[ingest] Failed to log run for ${adapter.sourceId}:`, logErr);
    }

    results[adapter.sourceId] = {
      items_found: itemsFound,
      items_new: itemsNew,
      duration_ms: duration,
      error: errorMessage,
    };
  }

  return json({
    ok: true,
    adapters: Object.keys(results).length,
    results,
    total_duration_ms: Date.now() - globalStart,
  }, 200);
};

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
