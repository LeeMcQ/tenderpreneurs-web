/**
 * src/pages/api/cron/ingest.ts
 *
 * SCHEMA-CORRECT version — column names exactly match D1 tenders table:
 *   id, source_id, source_ref, source_url, canonical_ref,
 *   title, description, procuring_entity, province, sector, category,
 *   closing_date, closing_time, published_date,
 *   briefing_date, briefing_compulsory, briefing_location,
 *   contact_name, contact_email, contact_phone,
 *   cidb_grade, estimated_value (ZAR cents), raw_html, documents_json,
 *   fingerprint, status (default 'open'),
 *   first_seen_at, last_seen_at, llm_extracted_at, llm_classified_at
 */

import type { APIRoute } from 'astro';
import { getAllAdapters, getAdapter } from '../../../lib/adapters/index.js';
import { getEnv, ulid, now, sha256, normaliseForFingerprint, cronSecretMatches } from '../../../lib/db.js';
import { bbbeeLevelNumber, cidbFromText, clockFromIso } from '../../../lib/tender-enrich.js';
import { closeExpired } from '../../../lib/tender-similar.js';
import { ensureReferenceSchema } from '../../../lib/tender-schema.js';
import { archiveTender } from '../../../lib/tender-archive.js';

export const prerender = false;

const MAX_PER_RUN = 400;
const OPEN_STATUSES = new Set(['', 'active', 'open', 'planning', 'planned', 'tender']);

function filenameFromUrl(url: string): string {
  try {
    const name = new URL(url).searchParams.get('downloadedFileName');
    if (name) return name;
  } catch {}
  return 'Document';
}

function toOpenStatus(raw: unknown): string {
  const s = String(raw ?? '').toLowerCase();
  if (!s || OPEN_STATUSES.has(s)) return 'open';
  return String(raw);
}

export const POST: APIRoute = async (ctx) => {
  const env = getEnv(ctx);

  const secret = ctx.request.headers.get('x-cron-secret');
  if (!cronSecretMatches(env, secret)) {
    return json({ error: 'Unauthorised' }, 401);
  }

  const db = env.DB;
  await ensureReferenceSchema(db);
  const url = new URL(ctx.request.url);
  const sourceParam = url.searchParams.get('source');
  const fetchMode = url.searchParams.get('fetch') === '1';
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
    const closed = await closeExpired(db);
    await logRun(db, sourceId, result, null, 0);
    return json({ ok: true, source: sourceId, closed_expired: closed, ...result }, 200);
  }

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

  const closed = await closeExpired(db);
  return json({ ok: true, results, closed_expired: closed, total_ms: Date.now() - globalStart }, 200);
};

async function writeTenders(db: D1Database, sourceId: string, tenders: any[]) {
  if (tenders.length === 0) return { items_found: 0, items_new: 0, items_updated: 0 };

  const itemsFound = tenders.length;
  let itemsNew = 0;
  let itemsUpdated = 0;

  const withFp = await Promise.all(
    tenders.map(async (t) => ({
      t,
      fp: await sha256(normaliseForFingerprint(`${t.title}|${t.externalId}|${t.buyer ?? ''}`)),
    }))
  );

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

  const archived: Array<{ id: string; t: any }> = [];

  if (toInsert.length > 0) {
    const stmts = toInsert.map(({ t, fp }) => {
      const id = ulid();
      const status = toOpenStatus(t.status);
      const estimatedValue = t.value ? Math.round(t.value * 100) : null;
      const docsJson = t.documentUrls?.length
        ? JSON.stringify(t.documentUrls.map((u: string) => ({ url: u, filename: filenameFromUrl(u) })))
        : null;
      archived.push({ id, t: { ...t, documents_json: docsJson } });
      return db.prepare(
        `INSERT INTO tenders (
           id, source_id, source_ref, source_url,
           title, description, procuring_entity,
           province, sector,
           closing_date, closing_time, published_date,
           briefing_date, briefing_compulsory, briefing_location,
           contact_name, contact_email, contact_phone,
           cidb_grade, estimated_value, documents_json,
           fingerprint, status, bbbee_required,
           first_seen_at, last_seen_at
         ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
      ).bind(
        id, sourceId, t.externalId, t.sourceUrl ?? null,
        t.title,
        t.description ? String(t.description).slice(0, 4000) : null,
        t.buyer ?? '',
        t.province ?? 'national',
        t.sector ?? 'consulting',
        (t.closingDate || '').slice(0, 10) || null,
        clockFromIso(t.closingDate),
        t.openingDate ?? null,
        t.briefingDate ?? null,
        t.briefingCompulsory ? 1 : 0,
        t.briefingVenue ?? null,
        t.contactName ?? null,
        t.contactEmail ?? null,
        t.contactPhone ?? null,
        cidbFromText(t.title, t.description),
        estimatedValue,
        docsJson,
        fp, status, bbbeeLevelNumber(t.title, t.description),
        now(), now(),
      );
    });
    for (let i = 0; i < stmts.length; i += 100) {
      await db.batch(stmts.slice(i, i + 100));
    }
    itemsNew = toInsert.length;
  }

  if (toUpdate.length > 0) {
    const stmts = toUpdate.map(({ t, fp }) => {
      const ex = existingMap.get(t.externalId)!;
      const status = toOpenStatus(t.status);
      const estimatedValue = t.value ? Math.round(t.value * 100) : null;
      const docsJson = t.documentUrls?.length
        ? JSON.stringify(t.documentUrls.map((u: string) => ({ url: u, filename: filenameFromUrl(u) })))
        : null;
      archived.push({ id: ex.id, t: { ...t, documents_json: docsJson } });
      return db.prepare(
        `UPDATE tenders SET
           title = ?, description = ?, procuring_entity = ?,
           closing_date = ?, closing_time = COALESCE(?, closing_time), status = ?,
           briefing_date = COALESCE(?, briefing_date),
           briefing_compulsory = CASE WHEN ? IS NOT NULL THEN ? ELSE briefing_compulsory END,
           briefing_location = COALESCE(?, briefing_location),
           contact_name = COALESCE(?, contact_name),
           contact_email = COALESCE(?, contact_email),
           contact_phone = COALESCE(?, contact_phone),
           cidb_grade = COALESCE(?, cidb_grade),
           estimated_value = COALESCE(?, estimated_value),
           documents_json = COALESCE(?, documents_json),
           bbbee_required = COALESCE(?, bbbee_required),
           fingerprint = ?,
           last_seen_at = ?
         WHERE id = ?`
      ).bind(
        t.title,
        t.description ? String(t.description).slice(0, 4000) : null,
        t.buyer ?? '',
        (t.closingDate || '').slice(0, 10) || null,
        clockFromIso(t.closingDate),
        status,
        t.briefingDate ?? null,
        t.briefingCompulsory ? 1 : null,
        t.briefingCompulsory ? 1 : null,
        t.briefingVenue ?? null,
        t.contactName ?? null,
        t.contactEmail ?? null,
        t.contactPhone ?? null,
        cidbFromText(t.title, t.description),
        estimatedValue,
        docsJson,
        bbbeeLevelNumber(t.title, t.description),
        fp, now(), ex.id,
      );
    });
    for (let i = 0; i < stmts.length; i += 100) {
      await db.batch(stmts.slice(i, i + 100));
    }
    itemsUpdated = toUpdate.length;
  }

  for (const row of archived.slice(0, 80)) {
    try {
      await archiveTender(db, {
        id: row.id,
        title: row.t.title,
        description: row.t.description ?? null,
        procuring_entity: row.t.buyer ?? null,
        briefing_location: row.t.briefingVenue ?? null,
        province: row.t.province ?? null,
        source_ref: row.t.externalId ?? null,
        source_url: row.t.sourceUrl ?? null,
        sector: row.t.sector ?? null,
        published_date: row.t.openingDate ?? null,
        closing_date: (row.t.closingDate || '').slice(0, 10) || null,
        closing_time: clockFromIso(row.t.closingDate),
        briefing_date: row.t.briefingDate ?? null,
        briefing_compulsory: row.t.briefingCompulsory ? 1 : 0,
        documents_json: row.t.documents_json ?? null,
      });
    } catch {
      break;
    }
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
      `INSERT INTO ingestion_runs (source_id, status, items_found, items_new, error_message, duration_ms)
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
