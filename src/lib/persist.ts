// Persist a raw tender to D1, with change detection and classification.
//
// Flow per tender:
//   1. Compute fingerprint (sha256 of title+ref+entity)
//   2. SELECT existing by (source_id, source_ref)
//   3. If new → INSERT, classify, dedupe
//   4. If exists but fingerprint changed → UPDATE, write tender_history
//   5. If exists and unchanged → just bump last_seen_at

import type { D1Database } from "@cloudflare/workers-types";
import type { RawTender } from "./adapters/base";
import { ulid, now, sha256, normaliseForFingerprint } from "./db";
import { classify } from "./classify/gemini";
import { linkDuplicates } from "./dedupe";

export interface PersistResult {
  id: string;
  status: "new" | "updated" | "unchanged";
  changes?: string[];
}

export async function persistTender(
  db: D1Database,
  geminiKey: string,
  groqKey: string,
  t: RawTender
): Promise<PersistResult> {
  const fingerprint = await sha256(
    normaliseForFingerprint(`${t.title}|${t.source_ref}|${t.procuring_entity || ""}`)
  );

  const existing = await db
    .prepare(
      `SELECT id, fingerprint, closing_date, status
       FROM tenders WHERE source_id = ? AND source_ref = ?`
    )
    .bind(t.source_id, t.source_ref)
    .first<{ id: string; fingerprint: string; closing_date: string | null; status: string }>();

  // Unchanged path — just bump last_seen
  if (existing && existing.fingerprint === fingerprint) {
    await db
      .prepare(`UPDATE tenders SET last_seen_at = ? WHERE id = ?`)
      .bind(now(), existing.id)
      .run();
    return { id: existing.id, status: "unchanged" };
  }

  // Changed path — UPDATE + history row
  if (existing) {
    const changes: string[] = [];
    if (existing.closing_date !== (t.closing_date || null)) {
      changes.push(`closing_date: ${existing.closing_date} → ${t.closing_date}`);
      await db
        .prepare(
          `INSERT INTO tender_history (tender_id, change_type, old_value, new_value)
           VALUES (?, 'extended', ?, ?)`
        )
        .bind(existing.id, existing.closing_date || "", t.closing_date || "")
        .run();
    }
    await db
      .prepare(
        `UPDATE tenders
         SET title = ?, description = ?, procuring_entity = ?,
             province = COALESCE(?, province), category = ?,
             closing_date = ?, closing_time = ?, briefing_date = ?,
             briefing_compulsory = ?, briefing_location = ?,
             contact_name = ?, contact_email = ?, contact_phone = ?,
             cidb_grade = ?, estimated_value = ?,
             documents_json = ?, fingerprint = ?, last_seen_at = ?
         WHERE id = ?`
      )
      .bind(
        t.title,
        t.description || null,
        t.procuring_entity || null,
        t.province || null,
        t.category || null,
        t.closing_date || null,
        t.closing_time || null,
        t.briefing_date || null,
        t.briefing_compulsory ? 1 : 0,
        t.briefing_location || null,
        t.contact_name || null,
        t.contact_email || null,
        t.contact_phone || null,
        t.cidb_grade || null,
        t.estimated_value || null,
        t.documents ? JSON.stringify(t.documents) : null,
        fingerprint,
        now(),
        existing.id
      )
      .run();
    return { id: existing.id, status: "updated", changes };
  }

  // New path — INSERT, classify, dedupe
  const id = ulid();
  const classification = await classify(geminiKey, groqKey, t);

  await db
    .prepare(
      `INSERT INTO tenders (
        id, source_id, source_ref, source_url, title, description,
        procuring_entity, province, sector, category,
        closing_date, closing_time, published_date,
        briefing_date, briefing_compulsory, briefing_location,
        contact_name, contact_email, contact_phone,
        cidb_grade, estimated_value, documents_json,
        fingerprint, status, llm_classified_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'open', ?)`
    )
    .bind(
      id,
      t.source_id,
      t.source_ref,
      t.source_url || null,
      t.title,
      t.description || null,
      t.procuring_entity || null,
      t.province || classification.province,
      classification.sector,
      t.category || null,
      t.closing_date || null,
      t.closing_time || null,
      t.published_date || null,
      t.briefing_date || null,
      t.briefing_compulsory ? 1 : 0,
      t.briefing_location || null,
      t.contact_name || null,
      t.contact_email || null,
      t.contact_phone || null,
      t.cidb_grade || null,
      t.estimated_value || null,
      t.documents ? JSON.stringify(t.documents) : null,
      fingerprint,
      now()
    )
    .run();

  // Cross-source dedupe
  await linkDuplicates(db, id, t.title, t.source_ref, t.source_id, t.procuring_entity || null);

  return { id, status: "new" };
}
