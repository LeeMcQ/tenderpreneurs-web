/**
 * src/pages/api/cron/ingest.ts
 *
 * Cloudflare Worker time limit: 30s CPU / 30s wall time on Pages.
 * Fixes:
 *  1. Run ONE adapter per request (pass ?source=etenders or ?source=treasury-bulletin)
 *     so each call finishes well within 30s.
 *  2. D1 batch() for inserts — one round-trip for up to 100 rows instead of N round-trips.
 *  3. Hard cap: max 100 tenders per run to guarantee we finish in time.
 *  4. Fingerprint check done in a single SELECT IN query, not N queries.
 *
 * GitHub Actions cron.yml calls this twice per schedule:
 *   POST /api/cron/ingest?source=etenders
 *   POST /api/cron/ingest?source=treasury-bulletin
 */

import type { APIRoute } from 'astro';
import { getAllAdapters, getAdapter } from '../../../lib/adapters/index.js';
import { getEnv, ulid, now, sha256, normaliseForFingerprint } from '../../../lib/db.js';

export const prerender = false;

/** Max tenders to process per single Worker invocation */
const MAX_PER_RUN = 100;

export const POST: APIRoute = async (ctx) => {
  const env = getEnv(ctx);

  const secret = ctx.request.headers.get('x-cron-secret');
  if (!env.SESSION_SECRET || secret !== env.SESSION_SECRET) {
    return json({ error: 'Unauthorised' }, 401);
  }

  const db = env.DB;
  const url = new URL(ctx.request.url);
  const sourceParam = url.searchParams.get('source');

  // If ?source= is given, run just that one; otherwise run all (for manual testing)
  const adapters = sourceParam
    ? [getAdapter(sourceParam)].filter(Boolean) as ReturnType<typeof getAllAdapters>
    : getAllAdapters();

  if (adapters.length === 0) {
    return json({ error: `No adapter found for source: ${sourceParam}` }, 400);
  }

  const results: Record<string, unknown> = {};
  const globalStart = Date.now();

  for (const adapter of adapters) {
    const adapterStart = Date.now();
    let itemsFound = 0;
    let itemsNew = 0;
    let itemsUpdated = 0;
    let errorMessage: string | null = null;

    try {
      const allTenders = await adapter.fetch();
      itemsFound = allTenders.length;

      // Cap to MAX_PER_RUN to stay within Worker time limit
      const tenders = allTenders.slice(0, MAX_PER_RUN);

      if (tenders.length > 0) {
        // ── Step 1: Build fingerprints for all tenders in parallel ──────────
        const withFp = await Promise.all(
          tenders.map(async (t) => ({
            tender: t,
            fingerprint: await sha256(
              normaliseForFingerprint(`${t.title}|${t.externalId}|${t.buyer ?? ''}`)
            ),
          }))
        );

        // ── Step 2: Bulk-check which source_refs already exist ──────────────
        const refs = tenders.map(t => t.externalId);
        // D1 doesn't support WHERE IN (?,?,?) with array bind — chunk to 50
        const existingMap = new Map<string, { id: string; fingerprint: string }>();
        for (let i = 0; i < refs.length; i += 50) {
          const chunk = refs.slice(i, i + 50);
          const placeholders = chunk.map(() => '?').join(',');
          const rows = await db
            .prepare(
              `SELECT id, source_ref, fingerprint FROM tenders
               WHERE source_id = ? AND source_ref IN (${placeholders})`
            )
            .bind(adapter.sourceId, ...chunk)
            .all<{ id: string; source_ref: string; fingerprint: string }>();
          for (const row of rows.results ?? []) {
            existingMap.set(row.source_ref, { id: row.id, fingerprint: row.fingerprint });
          }
        }

        // ── Step 3: Separate into INSERTs and UPDATEs ──────────────────────
        const toInsert: typeof withFp = [];
        const toUpdate: Array<{ existing: { id: string; fingerprint: string }; item: typeof withFp[0] }> = [];

        for (const item of withFp) {
          const existing = existingMap.get(item.tender.externalId);
          if (!existing) {
            toInsert.push(item);
          } else if (existing.fingerprint !== item.fingerprint) {
            toUpdate.push({ existing, item });
          }
        }

        // ── Step 4: Batch INSERT new tenders ────────────────────────────────
        if (toInsert.length > 0) {
          // D1 batch() takes an array of prepared statements
          const insertStmts = toInsert.map(({ tender: t, fingerprint }) => {
            const status = (t.status === 'active' || !t.status) ? 'open' : t.status;
            const valueCents = t.value ? Math.round(t.value * 100) : null;
            const summary = t.description ? t.description.slice(0, 500) : null;
            return db.prepare(
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
              ulid(), adapter.sourceId, t.externalId, t.sourceUrl ?? null,
              t.title, summary, t.buyer ?? '',
              t.province ?? 'national', t.sector ?? 'consulting',
              t.closingDate ?? null, t.openingDate ?? null,
              (t as any).briefingDate ?? null,
              (t as any).briefingCompulsory ? 1 : 0,
              valueCents,
              t.documentUrls?.length
                ? JSON.stringify(t.documentUrls.map((u: string) => ({ url: u })))
                : null,
              fingerprint, status, now(), now(),
            );
          });

          // D1 batch: up to 100 statements per call
          for (let i = 0; i < insertStmts.length; i += 100) {
            await db.batch(insertStmts.slice(i, i + 100));
          }
          itemsNew = toInsert.length;
        }

        // ── Step 5: Batch UPDATE changed tenders ────────────────────────────
        if (toUpdate.length > 0) {
          const updateStmts = toUpdate.map(({ existing, item: { tender: t, fingerprint } }) => {
            const status = (t.status === 'active' || !t.status) ? 'open' : t.status;
            const valueCents = t.value ? Math.round(t.value * 100) : null;
            const summary = t.description ? t.description.slice(0, 500) : null;
            return db.prepare(
              `UPDATE tenders SET
                 title=?, summary=?, procuring_entity=?,
                 closing_date=?, status=?, value_cents=?,
                 fingerprint=?, updated_at=?
               WHERE id=?`
            ).bind(
              t.title, summary, t.buyer ?? '',
              t.closingDate ?? null, status, valueCents,
              fingerprint, now(), existing.id,
            );
          });
          for (let i = 0; i < updateStmts.length; i += 100) {
            await db.batch(updateStmts.slice(i, i + 100));
          }
          itemsUpdated = toUpdate.length;
        }
      }

    } catch (err) {
      errorMessage = String(err);
      console.error(`[ingest] ${adapter.sourceId} failed:`, err);
    }

    const duration = Date.now() - adapterStart;

    // Log run
    try {
      await db.prepare(
        `INSERT INTO ingestion_runs
           (source_id, status, items_found, items_new, error_message, duration_ms)
         VALUES (?,?,?,?,?,?)`
      ).bind(
        adapter.sourceId,
        errorMessage ? 'failed' : 'success',
        itemsFound, itemsNew, errorMessage, duration,
      ).run();
    } catch (logErr) {
      console.error(`[ingest] Failed to log run:`, logErr);
    }

    results[adapter.sourceId] = {
      items_found: itemsFound,
      items_new: itemsNew,
      items_updated: itemsUpdated,
      capped_at: itemsFound > MAX_PER_RUN ? MAX_PER_RUN : null,
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
    status, headers: { 'Content-Type': 'application/json' },
  });
}
