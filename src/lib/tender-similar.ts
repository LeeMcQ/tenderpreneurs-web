/** Closed notices that look like this one — for checks and bid-pack memory. */

export type SimilarTender = {
  id: string;
  title: string;
  source_ref: string | null;
  procuring_entity: string | null;
  province: string | null;
  sector: string | null;
  closing_date: string | null;
  cidb_grade: string | null;
  status: string;
};

export async function findSimilarClosed(
  db: { prepare: Function },
  tender: { id: string; sector?: string | null; province?: string | null; title?: string | null },
): Promise<SimilarTender[]> {
  try {
    const rows = await db.prepare(
      `SELECT id, title, source_ref, procuring_entity, province, sector, closing_date, cidb_grade, status
       FROM tenders
       WHERE canonical_ref IS NULL
         AND id != ?
         AND status IN ('closed','awarded','cancelled','complete','unsuccessful')
         AND (sector = ? OR province = ?)
       ORDER BY closing_date DESC
       LIMIT 6`,
    ).bind(tender.id, tender.sector || '', tender.province || '').all();
    return (rows.results ?? []) as SimilarTender[];
  } catch {
    return [];
  }
}

export async function closeExpired(db: { prepare: Function }): Promise<number> {
  try {
    const res = await db.prepare(
      `UPDATE tenders
       SET status = 'closed'
       WHERE status = 'open'
         AND closing_date IS NOT NULL
         AND date(closing_date) < date('now')`,
    ).run();
    return Number(res?.meta?.changes ?? 0);
  } catch {
    return 0;
  }
}
