/**
 * src/pages/api/cron/ingest.ts
 *
 * Triggered every 6h by GitHub Actions (x-cron-secret auth).
 * Loops over all registered adapters, maps to the REAL D1 schema,
 * upserts tenders, and logs an ingestion_run row.
 *
 * D1 tenders table columns (from schema):
 *   id, source_id, source_ref, source_url, canonical_ref,
 *   title, summary, procuring_entity, province, sector,
 *   procurement_type, closing_date, closing_time, published_date,
 *   briefing_date, briefing_compulsory, value_cents,
 *   raw_html, documents_json, fingerprint,
 *   status (default 'open'), first_seen_at, updated_at,
 *   enriched_at, classified_at, cidb_grade
 */

import type { APIRoute } from 'astro';
import { getAllAdapters } from '../../../lib/adapters/index.js';
import { getEnv, ulid, now, sha256, normaliseForFingerprint } from '../../../lib/db.js';

export const prerender = false;

export const POST: APIRoute = async (ctx) => {
  const env = getEnv(ctx);

  // ── Auth ──────────────────────────────────────────────────────────────────
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

    // Log run start
    const runId = ulid();
    try {
      await db.prepare(
        `INSERT INTO ingestion_runs (id, source_id, status, started_at)
         VALUES (?, ?, 'running', ?)`
      ).bind(runId, adapter.sourceId, now()).run();
    } catch (_) { /* ingestion_runs table may not have id col — skip */ }

    try {
      const tenders = await adapter.fetch();
      itemsFound = tenders.length;

      for (const t of tenders) {
        // Build fingerprint from normalised title + externalId + buyer
        const fpInput = normaliseForFingerprint(
          `${t.title}|${t.externalId}|${t.buyer ?? ''}`
        );
        const fingerprint = await sha256(fpInput);

        // Map adapter fields → D1 schema columns
        const id = ulid();
        const sourceRef = t.externalId;           // e.g. OCDS ocid
        const procuringEntity = t.buyer ?? '';
        const summary = t.description
          ? t.description.slice(0, 500)
          : null;
        // Convert value from ZAR to cents (D1 stores value_cents)
        const valueCents = t.value ? Math.round(t.value * 100) : null;
        // Map our status: 'active' → 'open', everything else pass through
        const status = t.status === 'active' ? 'open' : (t.status ?? 'open');

        // Check if already exists by (source_id, source_ref)
        const existing = await db
          .prepare(`SELECT id, fingerprint FROM tenders WHERE source_id = ? AND source_ref = ?`)
          .bind(adapter.sourceId, sourceRef)
          .first<{ id: string; fingerprint: string }>();

        if (!existing) {
          // INSERT new tender
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
             VALUES
               (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
          ).bind(
            id,
            adapter.sourceId,
            sourceRef,
            t.sourceUrl ?? null,
            t.title,
            summary,
            procuringEntity,
            t.province ?? 'national',
            t.sector ?? 'general',
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
          // UPDATE changed tender
          await db.prepare(
            `UPDATE tenders SET
               title = ?, summary = ?, procuring_entity = ?,
               closing_date = ?, status = ?,
               value_cents = ?, fingerprint = ?,
               updated_at = ?
             WHERE id = ?`
          ).bind(
            t.title,
            summary,
            procuringEntity,
            t.closingDate ?? null,
            status,
            valueCents,
            fingerprint,
            now(),
            existing.id,
          ).run();
          itemsUpdated++;
        }
      }

    } catch (err) {
      errorMessage = String(err);
      console.error(`[ingest] ${adapter.sourceId} error:`, err);
    }

    const duration = Date.now() - adapterStart;

    // Update ingestion run log
    try {
      await db.prepare(
        `UPDATE ingestion_runs SET
           status = ?, items_found = ?, items_new = ?,
           error_message = ?, finished_at = ?, duration_ms = ?
         WHERE id = ?`
      ).bind(
        errorMessage ? 'failed' : 'success',
        itemsFound,
        itemsNew,
        errorMessage,
        now(),
        duration,
        runId,
      ).run();
    } catch (_) {
      // Fallback: insert a new row if update failed
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
      } catch (_2) { /* silent */ }
    }

    results[adapter.sourceId] = {
      items_found: itemsFound,
      items_new: itemsNew,
      items_updated: itemsUpdated,
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
