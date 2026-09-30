/** Flag sparse notices so ops can see coverage holes. Never throws. */

import { thinReasons } from './tender-enrich.js';
import { ensureOpsSchema } from './ops-schema.js';

export async function flagThinNotice(
  db: { prepare: (s: string) => { bind: (...a: unknown[]) => { run: () => Promise<unknown> } } },
  tender: Record<string, unknown> | null | undefined,
): Promise<string[]> {
  if (!tender?.id) return [];
  const reasons = thinReasons(tender);
  if (!reasons.length) return [];
  try {
    await ensureOpsSchema(db as any);
    await db.prepare(
      `INSERT INTO thin_notices (tender_id, reasons, flagged_at)
       VALUES (?, ?, datetime('now'))
       ON CONFLICT(tender_id) DO UPDATE SET
         reasons = excluded.reasons,
         flagged_at = excluded.flagged_at`,
    ).bind(String(tender.id), reasons.join(',')).run();
  } catch { /* quota / missing table — page still renders */ }
  return reasons;
}
