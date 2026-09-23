import type { APIRoute } from 'astro';
import { peekEnv, d1Fail } from '../../../../lib/db.js';
import { archiveTender } from '../../../../lib/tender-archive.js';
import { fetchOfficialRelease, isThinRow, patchFromRelease } from '../../../../lib/tender-enrich.js';

export const prerender = false;

async function enrichOne(env: NonNullable<ReturnType<typeof peekEnv>>, id: string) {
  const row = await env.DB.prepare(
    `SELECT id, source_ref, source_url, title, description, procuring_entity,
            closing_date, closing_time, published_date,
            briefing_date, briefing_compulsory, briefing_location,
            contact_name, contact_email, contact_phone,
            cidb_grade, estimated_value, documents_json
     FROM tenders WHERE id = ? AND canonical_ref IS NULL`,
  ).bind(id).first<Record<string, unknown>>();
  if (!row) return { status: 404 as const, body: { ok: false, error: 'Not found' } };

  const release = await fetchOfficialRelease(String(row.source_ref || ''), String(row.published_date || ''));
  if (!release) {
    return { status: 200 as const, body: { ok: true, skipped: true, thin: isThinRow(row), patch: {} } };
  }
  const patch = patchFromRelease(release, row);
  await env.DB.prepare(
    `UPDATE tenders SET
       description = COALESCE(?, description),
       procuring_entity = COALESCE(?, procuring_entity),
       closing_date = COALESCE(?, closing_date),
       closing_time = COALESCE(?, closing_time),
       published_date = COALESCE(?, published_date),
       briefing_date = COALESCE(?, briefing_date),
       briefing_compulsory = CASE WHEN ? IS NOT NULL THEN ? ELSE briefing_compulsory END,
       briefing_location = COALESCE(?, briefing_location),
       contact_name = COALESCE(?, contact_name),
       contact_email = COALESCE(?, contact_email),
       contact_phone = COALESCE(?, contact_phone),
       cidb_grade = COALESCE(?, cidb_grade),
       estimated_value = COALESCE(?, estimated_value),
       documents_json = COALESCE(?, documents_json),
       source_url = COALESCE(?, source_url)
     WHERE id = ?`,
  ).bind(
    patch.description ?? null,
    patch.procuring_entity ?? null,
    patch.closing_date ?? null,
    patch.closing_time ?? null,
    patch.published_date ?? null,
    patch.briefing_date ?? null,
    patch.briefing_compulsory ?? null,
    patch.briefing_compulsory ?? null,
    patch.briefing_location ?? null,
    patch.contact_name ?? null,
    patch.contact_email ?? null,
    patch.contact_phone ?? null,
    patch.cidb_grade ?? null,
    patch.estimated_value ?? null,
    patch.documents_json ?? null,
    patch.source_url ?? null,
    id,
  ).run();

  try {
    await env.DB.prepare(
      `UPDATE tenders SET
         submission_method = COALESCE(?, submission_method),
         evaluation_notes = COALESCE(?, evaluation_notes),
         returnables_json = COALESCE(?, returnables_json),
         enrich_source = COALESCE(?, enrich_source),
         enriched_at = datetime('now')
       WHERE id = ?`,
    ).bind(
      patch.submission_method ?? null,
      patch.evaluation_notes ?? null,
      patch.returnables_json ?? null,
      patch.enrich_source ?? null,
      id,
    ).run();
  } catch {
    // 0006 not applied yet
  }

  try {
    await archiveTender(env.DB, {
      id,
      title: String(row.title || ''),
      description: patch.description || String(row.description || ''),
      procuring_entity: patch.procuring_entity || String(row.procuring_entity || ''),
      source_ref: String(row.source_ref || ''),
      source_url: patch.source_url || String(row.source_url || ''),
      published_date: patch.published_date || String(row.published_date || ''),
      closing_date: patch.closing_date || String(row.closing_date || ''),
      closing_time: patch.closing_time || String(row.closing_time || ''),
      briefing_date: patch.briefing_date || String(row.briefing_date || ''),
      briefing_location: patch.briefing_location || String(row.briefing_location || ''),
      documents_json: patch.documents_json || String(row.documents_json || ''),
    });
  } catch {
    // archive tables optional
  }

  return { status: 200 as const, body: { ok: true, patch } };
}

export const POST: APIRoute = async (ctx) => {
  const env = peekEnv(ctx);
  const id = ctx.params.id;
  if (!env?.DB || !id) {
    return new Response(JSON.stringify({ ok: false, error: 'Unavailable' }), {
      status: 503,
      headers: { 'content-type': 'application/json' },
    });
  }
  try {
    const result = await enrichOne(env, id);
    return new Response(JSON.stringify(result.body), {
      status: result.status,
      headers: { 'content-type': 'application/json' },
    });
  } catch (err) {
    const fail = d1Fail(err);
    return new Response(JSON.stringify(fail.body), {
      status: fail.status,
      headers: { 'content-type': 'application/json' },
    });
  }
};

export const GET = POST;
