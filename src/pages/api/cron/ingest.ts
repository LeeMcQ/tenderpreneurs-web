/**
 * src/pages/api/cron/ingest.ts
 *
 * Fixes:
 *  1. ingestion_runs has no `id` column — removed id-based INSERT/UPDATE,
 *     use a single INSERT at the end of each adapter run instead
 *  2. Each adapter is wrapped in try/catch so one failure can't stop the others
 *  3. Column names match the real D1 tenders schema exactly
 */

import type { APIRoute } from 'astro';
import { getAllAdapters } from '../../../lib/adapters/index.js';
import { getEnv, ulid, now, sha256, normaliseForFingerprint } from '../../../lib/db.js';

export const prerender = false;

export const POST: APIRoute = async (ctx) => {
  const env = getEnv(ctx);

  const secret = ctx.request.headers.get('x-cron-secret');
  if (!env.SESSION_SECRET || secret !== env.SESSION_SECRET) {
    return json({ error: 'Unauthorised' }, 401);
  }

  const db = env.DB;
  const adapters = getAllAdapters();
  const results: Record<string, unknown> = {};
  const globalStart = Date.now();

  for (const adapter of adapters) {
    const adapterStart = Date.now();
    let itemsFound = 0;
    let itemsNew = 0;
    let itemsUpdated = 0;
    let errorMessage: string | null = null;

    try {
      const tenders = await adapter.fetch();
      itemsFound = tenders.length;

      for (const t of tenders) {
        try {
          const fpInput = normaliseForFingerprint(
            `${t.title}|${t.externalId}|${t.buyer ?? ''}`
          );
          const fingerprint = await sha256(fpInput);
          const procuringEntity = t.buyer ?? '';
          const summary = t.description ? t.description.slice(0, 500) : null;
          const valueCents = t.value ? Math.round(t.value * 100) : null;
          const status = (t.status === 'active' || !t.status) ? 'open' : t.status;

          const existing = await db
            .prepare(
              `SELECT id, fingerprint FROM tenders
               WHERE source_id = ? AND source_ref = ?`
            )
            .bind(adapter.sourceId, t.externalId)
            .first<{ id: string; fingerprint: string }>();

          if (!existing) {
            await db.prepare(
              `INSERT INTO tenders
                 (id, source_id, source_ref, source_url,
                  title, summary, procuring_entity,
                  province, sector,
                  closing_date, published_date,
                  briefing_date, briefing_compulsory,
                  value_cents, documents_json,
                  fingerprint, status,
                  first_seen_at, updated_at)
               VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
            ).bind(
              ulid(),
              adapter.sourceId,
              t.externalId,
              t.sourceUrl ?? null,
              t.title,
              summary,
              procuringEntity,
              t.province ?? 'national',
              t.sector ?? 'consulting',
              t.closingDate ?? null,
              t.openingDate ?? null,
              (t as any).briefingDate ?? null,
              (t as any).briefingCompulsory ? 1 : 0,
              valueCents,
              t.documentUrls?.length
                ? JSON.stringify(t.documentUrls.map((u: string) => ({ url: u })))
                : null,
              fingerprint,
              status,
              now(),
              now(),
            ).run();
            itemsNew++;

          } else if (existing.fingerprint !== fingerprint) {
            await db.prepare(
              `UPDATE tenders SET
                 title = ?, summary = ?, procuring_entity = ?,
                 closing_date = ?, status = ?,
                 value_cents = ?, fingerprint = ?,
                 updated_at = ?
               WHERE id = ?`
            ).bind(
              t.title, summary, procuringEntity,
              t.closingDate ?? null, status,
              valueCents, fingerprint, now(),
              existing.id,
            ).run();
            itemsUpdated++;
          }
        } catch (rowErr) {
          // Skip individual bad rows — don't abort the whole batch
          console.error(`[ingest] Row error (${adapter.sourceId}/${t.externalId}):`, rowErr);
        }
      }

    } catch (err) {
      errorMessage = String(err);
      console.error(`[ingest] Adapter ${adapter.sourceId} failed:`, err);
    }

    const duration = Date.now() - adapterStart;

    // Log the run — simple INSERT, no id column needed
    try {
      await db.prepare(
        `INSERT INTO ingestion_runs
           (source_id, status, items_found, items_new, error_message, duration_ms)
         VALUES (?, ?, ?, ?, ?, ?)`
      ).bind(
        adapter.sourceId,
        errorMessage ? 'failed' : 'success',
        itemsFound,
        itemsNew,
        errorMessage,
        duration,
      ).run();
    } catch (logErr) {
      console.error(`[ingest] Failed to log run for ${adapter.sourceId}:`, logErr);
    }

    results[adapter.sourceId] = {
      items_found: itemsFound,
      items_new: itemsNew,
      items_updated: itemsUpdated,
      duration_ms: duration,
      error: errorMessage,
    };

    console.log(`[ingest] ${adapter.sourceId}: found=${itemsFound} new=${itemsNew} updated=${itemsUpdated} error=${errorMessage ?? 'none'}`);
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
