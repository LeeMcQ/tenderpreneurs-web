/** Write resolved place, documents, events, and FTS for later lookup. */
import type { D1Database } from '@cloudflare/workers-types';
import { ulid } from './db';
import { resolveLocation, type LocationFields } from './tender-location';

export type ArchiveRow = LocationFields & {
  id: string;
  source_ref?: string | null;
  source_url?: string | null;
  sector?: string | null;
  published_date?: string | null;
  closing_date?: string | null;
  closing_time?: string | null;
  briefing_date?: string | null;
  briefing_compulsory?: number | boolean | null;
  documents_json?: string | null;
  raw_html?: string | null;
};

function parseDocs(json: string | null | undefined): Array<{ filename?: string; url?: string; r2_key?: string; size_bytes?: number; content_type?: string }> {
  if (!json) return [];
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function archiveTender(db: D1Database, row: ArchiveRow): Promise<void> {
  const loc = resolveLocation(row);

  await db
    .prepare(
      `UPDATE tenders
       SET locality = ?, locality_precision = ?, locality_lat = ?, locality_lng = ?, locality_source = ?
       WHERE id = ?`,
    )
    .bind(loc.town ?? loc.label, loc.precision, loc.lat, loc.lng, loc.source, row.id)
    .run();

  await db
    .prepare(
      `INSERT INTO tender_locations (tender_id, label, town, province, precision, source, lat, lng, resolved_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
       ON CONFLICT(tender_id) DO UPDATE SET
         label = excluded.label,
         town = excluded.town,
         province = excluded.province,
         precision = excluded.precision,
         source = excluded.source,
         lat = excluded.lat,
         lng = excluded.lng,
         resolved_at = excluded.resolved_at`,
    )
    .bind(row.id, loc.label, loc.town, loc.province, loc.precision, loc.source, loc.lat, loc.lng)
    .run();

  await db.prepare(`DELETE FROM tender_events WHERE tender_id = ?`).bind(row.id).run();
  const events: Array<[string, string | null, string | null, string | null, number]> = [];
  if (row.published_date) events.push(['published', row.published_date, null, null, 0]);
  if (row.briefing_date || row.briefing_location) {
    events.push([
      'briefing',
      row.briefing_date ?? null,
      null,
      row.briefing_location ?? loc.town,
      row.briefing_compulsory ? 1 : 0,
    ]);
  }
  if (row.closing_date) events.push(['closing', row.closing_date, row.closing_time ?? null, null, 0]);
  for (const ev of events) {
    await db
      .prepare(
        `INSERT INTO tender_events (tender_id, kind, at_date, at_time, place, compulsory)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .bind(row.id, ...ev)
      .run();
  }

  const docs = parseDocs(row.documents_json);
  for (const doc of docs) {
    if (!doc.url && !doc.filename) continue;
    await db
      .prepare(
        `INSERT OR IGNORE INTO tender_documents (id, tender_id, filename, url, r2_key, size_bytes, content_type)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        ulid(),
        row.id,
        doc.filename ?? null,
        doc.url ?? null,
        doc.r2_key ?? null,
        doc.size_bytes ?? null,
        doc.content_type ?? null,
      )
      .run();
  }

  if (row.source_url || row.raw_html) {
    await db
      .prepare(
        `INSERT INTO tender_snapshots (tender_id, source_url, raw_excerpt)
         VALUES (?, ?, ?)`,
      )
      .bind(row.id, row.source_url ?? null, row.raw_html ? String(row.raw_html).slice(0, 4000) : null)
      .run();
  }

  await db.prepare(`DELETE FROM tenders_fts WHERE tender_id = ?`).bind(row.id).run();
  await db
    .prepare(
      `INSERT INTO tenders_fts (tender_id, title, description, entity, source_ref, place, sector)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      row.id,
      row.title ?? '',
      row.description ?? '',
      row.procuring_entity ?? '',
      row.source_ref ?? '',
      loc.label,
      row.sector ?? '',
    )
    .run();
}
