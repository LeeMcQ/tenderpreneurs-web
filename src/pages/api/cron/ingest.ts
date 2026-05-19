// Ingestion cron.
//
// Triggered by Cloudflare cron (every 6 hours, see wrangler.toml).
// Iterates over enabled sources, runs each adapter, persists results,
// records ingestion_runs. Also reachable as a POST endpoint with a
// shared secret (for manual triggering during development).

import type { APIRoute } from "astro";
import { getEnv, now } from "../../../lib/db";
import { ADAPTERS, getAdapter } from "../../../lib/adapters";
import { persistTender } from "../../../lib/persist";
import { extractWithDeepSeek, mergeExtraction } from "../../../lib/extract/deepseek";

export const prerender = false;

interface RunSummary {
  source_id: string;
  status: "success" | "failed" | "partial";
  found: number;
  new: number;
  updated: number;
  error?: string;
  duration_ms: number;
}

async function runOnce(env: any): Promise<RunSummary[]> {
  // Get active sources from D1, ordered by oldest last_run_at first.
  const sources = await env.DB.prepare(
    `SELECT id, last_run_at FROM sources
     WHERE active = 1
     ORDER BY COALESCE(last_run_at, '1970-01-01') ASC`
  ).all<{ id: string; last_run_at: string | null }>();

  const summaries: RunSummary[] = [];

  for (const src of sources.results || []) {
    const adapter = getAdapter(src.id);
    if (!adapter) continue;

    const runStart = now();
    const inserted = await env.DB.prepare(
      `INSERT INTO ingestion_runs (source_id, started_at, status) VALUES (?, ?, 'running')`
    )
      .bind(src.id, runStart)
      .run();
    const runId = inserted.meta.last_row_id;

    const result = await adapter.run(env);

    let newCount = 0, updatedCount = 0, errored = 0;
    if (result.ok) {
      for (const raw of result.items) {
        try {
          // Enrich if critical fields are missing
          let enriched = raw;
          const missingCritical =
            !raw.closing_date ||
            !raw.procuring_entity ||
            (raw.raw_html && (!raw.contact_email && !raw.contact_phone));

          if (missingCritical && raw.raw_html && env.OPENROUTER_API_KEY) {
            try {
              const ex = await extractWithDeepSeek(env.OPENROUTER_API_KEY, {
                title: raw.title,
                rawText: raw.raw_html,
              });
              enriched = mergeExtraction(raw, ex);
            } catch (e) {
              // Extraction failures are non-fatal; persist what we have
            }
          }

          const persisted = await persistTender(env.DB, env.GEMINI_API_KEY, env.GROQ_API_KEY, enriched);
          if (persisted.status === "new") newCount++;
          if (persisted.status === "updated") updatedCount++;
        } catch (err) {
          errored++;
        }
      }
    }

    const summary: RunSummary = {
      source_id: src.id,
      status: result.ok ? (errored > result.items.length / 2 ? "partial" : "success") : "failed",
      found: result.items.length,
      new: newCount,
      updated: updatedCount,
      error: result.error,
      duration_ms: result.duration_ms,
    };
    summaries.push(summary);

    await env.DB.prepare(
      `UPDATE ingestion_runs
       SET finished_at = ?, status = ?, items_found = ?, items_new = ?, items_updated = ?, error_message = ?, duration_ms = ?
       WHERE id = ?`
    )
      .bind(
        now(),
        summary.status,
        summary.found,
        summary.new,
        summary.updated,
        summary.error || null,
        summary.duration_ms,
        runId
      )
      .run();

    await env.DB.prepare(
      `UPDATE sources
       SET last_run_at = ?, last_success_at = CASE WHEN ? = 'success' THEN ? ELSE last_success_at END
       WHERE id = ?`
    )
      .bind(now(), summary.status, now(), src.id)
      .run();
  }

  return summaries;
}

// Manual trigger (dev / catch-up): POST with shared secret header
export const POST: APIRoute = async (ctx) => {
  const env = getEnv(ctx);
  const auth = ctx.request.headers.get("x-cron-secret");
  if (auth !== env.SESSION_SECRET) {
    return new Response("unauthorized", { status: 401 });
  }
  const summaries = await runOnce(env);
  return new Response(JSON.stringify({ ok: true, summaries }, null, 2), {
    headers: { "content-type": "application/json" },
  });
};

// Cron entry point — Cloudflare invokes this via the scheduled handler.
// Astro on Pages exposes scheduled() via the worker; we mirror the logic here.
export const GET: APIRoute = async (ctx) => {
  // Block public GET — only manual debug invocations with secret
  const env = getEnv(ctx);
  const auth = ctx.request.headers.get("x-cron-secret");
  if (auth !== env.SESSION_SECRET) {
    return new Response("unauthorized", { status: 401 });
  }
  const summaries = await runOnce(env);
  return new Response(JSON.stringify({ ok: true, summaries }, null, 2), {
    headers: { "content-type": "application/json" },
  });
};
