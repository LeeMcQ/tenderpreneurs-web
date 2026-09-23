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
  description?: string | null;
  estimated_value?: number | null;
  briefing_date?: string | null;
};

export type Lesson = {
  severity: 'info' | 'warning';
  message: string;
};

export async function findSimilarClosed(
  db: { prepare: Function },
  tender: { id: string; sector?: string | null; province?: string | null; title?: string | null },
): Promise<SimilarTender[]> {
  try {
    const rows = await db.prepare(
      `SELECT id, title, source_ref, procuring_entity, province, sector, closing_date,
              cidb_grade, status, description, estimated_value, briefing_date
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

export async function rememberComparables(
  db: { prepare: Function },
  tenderId: string,
  closed: SimilarTender[],
): Promise<void> {
  for (const peer of closed) {
    try {
      await db.prepare(
        `INSERT OR IGNORE INTO tender_comparables (tender_id, closed_id, reason)
         VALUES (?, ?, ?)`,
      ).bind(tenderId, peer.id, peer.sector || peer.province || 'similar').run();
    } catch {
      break;
    }
  }
}

export function lessonsFromClosed(
  open: {
    description?: string | null;
    sector?: string | null;
    estimated_value?: number | null;
    briefing_date?: string | null;
    cidb_grade?: string | null;
  },
  closed: Array<{
    title?: string | null;
    description?: string | null;
    estimated_value?: number | null;
    briefing_date?: string | null;
    cidb_grade?: string | null;
    procuring_entity?: string | null;
    closing_date?: string | null;
    status?: string;
  }>,
): Lesson[] {
  const lessons: Lesson[] = [];
  if (!closed.length) return lessons;
  const openDesc = (open.description || '').trim();
  const peerDesc = closed.reduce((m, p) => Math.max(m, (p.description || '').trim().length), 0);
  if (openDesc.length < 120 && peerDesc > 200) {
    lessons.push({
      severity: 'warning',
      message: 'This notice is short compared with closed peers in the same sector. Recover the official scope before pricing.',
    });
  }
  const peerValues = closed.map((p) => Number(p.estimated_value || 0)).filter((n) => n > 0);
  if (!open.estimated_value && peerValues.length) {
    const avg = Math.round(peerValues.reduce((a, b) => a + b, 0) / peerValues.length / 100);
    lessons.push({
      severity: 'info',
      message: `Closed peers published estimates around R${avg.toLocaleString('en-ZA')}. Use that only as a sanity check, not a bid price.`,
    });
  }
  if (!open.briefing_date && closed.some((p) => p.briefing_date)) {
    lessons.push({
      severity: 'warning',
      message: 'Similar closed notices ran a briefing. Confirm on the official page whether attendance is compulsory.',
    });
  }
  if (open.sector === 'construction' && !open.cidb_grade && closed.some((p) => p.cidb_grade)) {
    lessons.push({
      severity: 'warning',
      message: `Closed construction peers required CIDB ${closed.find((p) => p.cidb_grade)?.cidb_grade}. Check the bid document before you price.`,
    });
  }
  return lessons;
}

export function draftBidPack(
  tender: {
    title?: string | null;
    description?: string | null;
    sector?: string | null;
    procuring_entity?: string | null;
  },
  closed: Array<{ title?: string | null; description?: string | null; procuring_entity?: string | null; status?: string }>,
): { summary: string; checklist: Array<{ code: string; label: string }>; sections: string[] } {
  const entity = tender.procuring_entity || 'the procuring entity';
  const peer = closed[0]?.title;
  const checklist = [
    { code: 'CSD', label: 'CSD registration report' },
    { code: 'TCS', label: 'SARS tax compliance PIN' },
    { code: 'BBBEE', label: 'B-BBEE certificate or EME/QSE affidavit' },
    { code: 'CIPC', label: 'CIPC company registration' },
    { code: 'SBD1', label: 'SBD 1 Invitation to bid' },
    { code: 'SBD4', label: 'SBD 4 Declaration of interest' },
    { code: 'SBD6.1', label: 'SBD 6.1 Preference points' },
    { code: 'SBD8', label: 'SBD 8 Past SCM practices' },
    { code: 'SBD9', label: 'SBD 9 Independent bid determination' },
  ];
  return {
    summary: `Starter response for ${entity}. Treat this as a packing list, not a submitted bid.`,
    checklist,
    sections: [
      `Cover letter addressed to ${entity}, quoting the bid number and closing date.`,
      `Restate the published scope in your own words: ${(tender.description || tender.title || '').slice(0, 180)}`,
      'Methodology and programme — how you will deliver, with dates that beat the published close.',
      'Team and relevant work. Cite closed comparable notices only as experience, not as copied answers.',
      peer ? `Price schedule informed by closed peer \u201c${peer}\u201d, then rebuilt from this scope.` : 'Price schedule built from the official bill / specification.',
      'Compliance file: CSD, tax PIN, B-BBEE, CIPC, SBD forms, and any sector certificates.',
    ],
  };
}
