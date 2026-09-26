/**
 * src/pages/api/cron/ingest.ts
 *
 * SCHEMA-CORRECT version — column names exactly match D1 tenders table.
 */

import type { APIRoute } from 'astro';
import { getAllAdapters, getAdapter } from '../../../lib/adapters/index.js';
import { getEnv, ulid, now, sha256, normaliseForFingerprint, cronSecretMatches, d1Fail } from '../../../lib/db.js';
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
  try {
    return await handleIngest(ctx);
  } catch (err) {
    console.error('[ingest]', err);
    const fail = d1Fail(err);
    return json(fail.body, fail.status);
  }
};

async function handleIngest(ctx: Parameters<APIRoute>[0]): Promise<Response> {
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
}
