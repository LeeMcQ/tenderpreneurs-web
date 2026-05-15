// Dedupe.
//
// Tenders frequently appear in multiple sources: eTenders, the Treasury
// Bulletin, and the procuring department's own site can all carry the
// same RFT. We dedupe in two passes:
//
//   1. EXACT match on normalised source_ref (different sources sometimes
//      keep the same reference number).
//   2. FUZZY match on normalised (title + procuring_entity) — uses a
//      simple token-set Jaccard at threshold 0.85.
//
// A duplicate row stays in the table (audit trail) but gets canonical_ref
// pointing to the "winning" row. The winning row is the earliest
// first_seen_at, or, on ties, the one from a national source.

import type { D1Database } from "@cloudflare/workers-types";
import { normaliseForFingerprint } from "./db";

const SOURCE_PRIORITY: Record<string, number> = {
  etenders: 100,
  "treasury-bulletin": 90,
  sanral: 80,
  // metros / provincial treasuries / SOEs all default to 50
};

function priorityOf(sourceId: string): number {
  return SOURCE_PRIORITY[sourceId] ?? 50;
}

function tokenize(s: string): Set<string> {
  return new Set(
    normaliseForFingerprint(s)
      .split(/[^a-z0-9]+/)
      .filter((t) => t.length >= 3)
  );
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter++;
  const union = a.size + b.size - inter;
  return inter / union;
}

interface ExistingTender {
  id: string;
  source_id: string;
  source_ref: string;
  title: string;
  procuring_entity: string | null;
  first_seen_at: string;
  canonical_ref: string | null;
}

/**
 * For a newly upserted tender, find duplicates and link them via canonical_ref.
 * Called once per tender after upsert.
 */
export async function linkDuplicates(
  db: D1Database,
  newTenderId: string,
  title: string,
  sourceRef: string,
  sourceId: string,
  procuringEntity: string | null
): Promise<{ canonical_ref: string | null; matched: number }> {
  // Pass 1: exact source_ref match across other sources
  const normRef = normaliseForFingerprint(sourceRef);
  const exact = await db
    .prepare(
      `SELECT id, source_id, source_ref, title, procuring_entity, first_seen_at, canonical_ref
       FROM tenders
       WHERE id != ?
         AND lower(replace(replace(replace(source_ref, ' ', ''), '-', ''), '/', '')) =
             lower(replace(replace(replace(?, ' ', ''), '-', ''), '/', ''))
       LIMIT 20`
    )
    .bind(newTenderId, normRef)
    .all<ExistingTender>();

  const candidates: ExistingTender[] = exact.results || [];

  // Pass 2: fuzzy title+entity (only if no exact match found)
  if (candidates.length === 0 && title && procuringEntity) {
    const fuzzy = await db
      .prepare(
        `SELECT id, source_id, source_ref, title, procuring_entity, first_seen_at, canonical_ref
         FROM tenders
         WHERE id != ?
           AND procuring_entity IS NOT NULL
           AND lower(procuring_entity) LIKE ?
         LIMIT 50`
      )
      .bind(newTenderId, `%${procuringEntity.toLowerCase().slice(0, 30)}%`)
      .all<ExistingTender>();

    const newTokens = tokenize(title);
    for (const candidate of fuzzy.results || []) {
      if (jaccard(newTokens, tokenize(candidate.title)) >= 0.85) {
        candidates.push(candidate);
      }
    }
  }

  if (candidates.length === 0) {
    return { canonical_ref: null, matched: 0 };
  }

  // Pick the canonical: highest source priority, then earliest first_seen_at
  const winners = [
    ...candidates,
    {
      id: newTenderId,
      source_id: sourceId,
      source_ref: sourceRef,
      title,
      procuring_entity: procuringEntity,
      first_seen_at: new Date().toISOString(),
      canonical_ref: null as string | null,
    },
  ];
  winners.sort((a, b) => {
    const p = priorityOf(b.source_id) - priorityOf(a.source_id);
    if (p !== 0) return p;
    return a.first_seen_at.localeCompare(b.first_seen_at);
  });
  const canonical = winners[0];

  // Link all non-canonical rows (including the new one if it isn't the canonical)
  for (const row of winners) {
    if (row.id === canonical.id) continue;
    await db
      .prepare(`UPDATE tenders SET canonical_ref = ? WHERE id = ?`)
      .bind(canonical.id, row.id)
      .run();
  }

  return {
    canonical_ref: canonical.id === newTenderId ? null : canonical.id,
    matched: candidates.length,
  };
}
