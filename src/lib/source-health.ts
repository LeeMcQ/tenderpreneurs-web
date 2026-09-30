import { now } from './db.js';

export async function recordSourceHealth(
  db: { prepare: (s: string) => { bind: (...a: unknown[]) => { run: () => Promise<unknown> } } },
  source: string,
  result: { items_found?: number; items_new?: number; error?: string | null; http?: number | null },
): Promise<void> {
  const ok = !result.error;
  const ts = now();
  try {
    await db.prepare(
      `INSERT INTO source_health (source, last_ok_at, last_fail_at, last_http, last_error, items_ok, items_fail, note)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(source) DO UPDATE SET
         last_ok_at = CASE WHEN excluded.last_error IS NULL THEN excluded.last_ok_at ELSE source_health.last_ok_at END,
         last_fail_at = CASE WHEN excluded.last_error IS NOT NULL THEN excluded.last_fail_at ELSE source_health.last_fail_at END,
         last_http = excluded.last_http,
         last_error = excluded.last_error,
         items_ok = source_health.items_ok + excluded.items_ok,
         items_fail = source_health.items_fail + excluded.items_fail,
         note = excluded.note`,
    ).bind(
      source,
      ok ? ts : null,
      ok ? null : ts,
      result.http ?? null,
      result.error ?? null,
      ok ? Number(result.items_found ?? 0) : 0,
      ok ? 0 : 1,
      result.items_new != null ? `${result.items_new} new` : null,
    ).run();
  } catch {
    /* schema not applied yet or quota — ingest must still return */
  }
}
