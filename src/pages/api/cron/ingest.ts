/**
 * src/pages/api/cron/ingest.ts
 *
 * Two modes:
 *
 * MODE A — GitHub Actions pushes pre-fetched data (recommended):
 *   POST /api/cron/ingest
 *   Body: { source: "etenders", tenders: [...RawTender[]] }
 *   The Worker only does D1 writes — stays well under 30s.
 *
 * MODE B — Worker fetches internally (fallback, may timeout on slow APIs):
 *   POST /api/cron/ingest?source=etenders&fetch=1
 *
 * GitHub Actions fetch script: .github/scripts/fetch-etenders.js
 */

import type { APIRoute } from 'astro';
import { getAllAdapters, getAdapter } from '../../../lib/adapters/index.js';
import { getEnv, ulid, now, sha256, normaliseForFingerprint } from '../../../lib/db.js';

export const prerender = false;

const MAX_PER_RUN = 200;

export const POST: APIRoute = async (ctx) => {
  const env = getEnv(ctx);

  const secret = ctx.request.headers.get('x-cron-secret');
  if (!env.SESSION_SECRET || secret !== env.SESSION_SECRET) {
    return json({ error: 'Unauthorised' }, 401);
  }

  const db = env.DB;
  const url = new URL(ctx.request.url);
  const sourceParam = url.searchParams.get('source');
  const fetchMode = url.searchParams.get('fetch') === '1';

  // ── MODE A: body contains pre-fetched tenders ──────────────────────────
  const contentType = ctx.request.headers.get('content-type') ?? '';
  if (contentType.includes('application/json') && !fetchMode) {
    let body: any;
    try {
      body = await ctx.request.json();
    } catch {
      return json({ error: 'Invalid JSON body' }, 400);
    }

    const sourceId: string = body.source;
    const rawTenders: any[] = body.tenders ?? [];

    if (!sourceId || !rawTenders.length) {
      return json({ error: 'Body must have source and tenders[]' }, 400);
    }

    const result = await writeTenders(db, sourceId, rawTenders);
    return json({ ok: true, source: sourceId, ...result }, 200);
  }

  // ── MODE B: Worker fetches internally ─────────────────────────────────
  const adapters = sourceParam
    ? [getAdapter(sourceParam)].filter(Boolean) as any[]
    : getAllAdapters();

  if (adapters.length === 0) {
    return json({ error: `No adapter: ${sourceParam}` }, 400);
  }

  const results: Record<string, unknown> = {};
  const globalStart = Date.now();

  for (const adapter of adapters) {
    let tenders: any[] = [];
    let errorMessage: string | null = null;
    const adapterStart = Date.now();

    try {
      tenders = await adapter.fetch();
    } catch (err) {
      errorMessage = String(err);
      console.error(`[ingest] ${adapter.sourceId} fetch failed:`, err);
    }

    const writeResult = errorMessage
      ? { items_found: 0, items_new: 0, items_updated: 0 }
      : await writeTenders(db, adapter.sourceId, tenders.slice(0, MAX_PER_RUN));

    const duration = Date.now() - adapterStart;
    await logRun(db, adapter.sourceId, writeResult, errorMessage, duration);

    results[adapter.sourceId] = {
      ...writeResult,
      duration_ms: duration,
      error: errorMessage,
    };
  }

  return json({ ok: true, results, total_ms: Date.now() - globalStart }, 200);
};

// ── Shared write logic ────────────────────────────────────────────────────

async function writeTenders(db: D1Database, sourceId: string, tenders: any[]) {
  if (tenders.length === 0) return { items_found: 0, items_new: 0, items_updated: 0 };

  const itemsFound = tenders.length;
  let itemsNew = 0;
  let itemsUpdated = 0;

  // Build fingerprints
  const withFp = await Promise.all(
    tenders.map(async (t) => ({
      t,
      fp: await sha256(normaliseForFingerprint(`${t.title}|${t.externalId}|${t.buyer ?? ''}`)),
    }))
  );

  // Bulk check existing
  const refs = tenders.map(t => t.externalId);
  const existingMap = new Map<string, { id: string; fingerprint: string }>();
  for (let i = 0; i < refs.length; i += 50) {
    const chunk = refs.slice(i, i + 50);
    const ph = chunk.map(() => '?').join(',');
    const rows = await db
      .prepare(`SELECT id, source_ref, fingerprint FROM tenders WHERE source_id=? AND source_ref IN (${ph})`)
      .bind(sourceId, ...chunk)
      .all<{ id: string; source_ref: string; fingerprint: string }>();
    for (const r of rows.results ?? []) existingMap.set(r.source_ref, r);
  }

  const toInsert = withFp.filter(({ t }) => !existingMap.has(t.externalId));
  const toUpdate = withFp.filter(({ t, fp }) => {
    const ex = existingMap.get(t.externalId);
    return ex && ex.fingerprint !== fp;
  });

  // Batch INSERT
  if (toInsert.length > 0) {
    const stmts = toInsert.map(({ t, fp }) => {
      const status = (!t.status || t.status === 'active') ? 'open' : t.status;
      return db.prepare(
        `INSERT INTO tenders
           (id,source_id,source_ref,source_url,title,summary,procuring_entity,
            province,sector,closing_date,published_date,briefing_date,
            briefing_compulsory,value_cents,documents_json,fingerprint,status,
            first_seen_at,updated_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
      ).bind(
        ulid(), sourceId, t.externalId, t.sourceUrl ?? null,
        t.title,
        t.description ? t.description.slice(0, 500) : null,
        t.buyer ?? '',
        t.province ?? 'national',
        t.sector ?? 'consulting',
        t.closingDate ?? null,
        t.openingDate ?? null,
        t.briefingDate ?? null,
        t.briefingCompulsory ? 1 : 0,
        t.value ? Math.round(t.value * 100) : null,
        t.documentUrls?.length ? JSON.stringify(t.documentUrls.map((u: string) => ({ url: u }))) : null,
        fp, status, now(), now(),
      );
    });
    for (let i = 0; i < stmts.length; i += 100) {
      await db.batch(stmts.slice(i, i + 100));
    }
    itemsNew = toInsert.length;
  }

  // Batch UPDATE
  if (toUpdate.length > 0) {
    const stmts = toUpdate.map(({ t, fp }) => {
      const ex = existingMap.get(t.externalId)!;
      const status = (!t.status || t.status === 'active') ? 'open' : t.status;
      return db.prepare(
        `UPDATE tenders SET title=?,summary=?,procuring_entity=?,closing_date=?,
         status=?,value_cents=?,fingerprint=?,updated_at=? WHERE id=?`
      ).bind(
        t.title,
        t.description ? t.description.slice(0, 500) : null,
        t.buyer ?? '',
        t.closingDate ?? null,
        status,
        t.value ? Math.round(t.value * 100) : null,
        fp, now(), ex.id,
      );
    });
    for (let i = 0; i < stmts.length; i += 100) {
      await db.batch(stmts.slice(i, i + 100));
    }
    itemsUpdated = toUpdate.length;
  }

  return { items_found: itemsFound, items_new: itemsNew, items_updated: itemsUpdated };
}

async function logRun(
  db: D1Database,
  sourceId: string,
  result: { items_found: number; items_new: number },
  errorMessage: string | null,
  duration: number
) {
  try {
    await db.prepare(
      `INSERT INTO ingestion_runs (source_id,status,items_found,items_new,error_message,duration_ms)
       VALUES (?,?,?,?,?,?)`
    ).bind(
      sourceId,
      errorMessage ? 'failed' : 'success',
      result.items_found, result.items_new,
      errorMessage, duration,
    ).run();
  } catch (e) {
    console.error('[ingest] log failed:', e);
  }
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status, headers: { 'Content-Type': 'application/json' },
  });
}
