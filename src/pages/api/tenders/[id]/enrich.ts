import type { APIRoute } from 'astro';
import { peekEnv, d1Fail } from '../../../../lib/db.js';
import { fetchOfficialRelease, patchFromRelease } from '../../../../lib/tender-enrich.js';

export const prerender = false;

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
    const row = await env.DB.prepare(
      `SELECT id, source_ref, source_url, title, description, procuring_entity,
              closing_date, closing_time, published_date,
              briefing_date, briefing_compulsory, briefing_location,
              contact_name, contact_email, contact_phone,
              cidb_grade, estimated_value, documents_json
       FROM tenders WHERE id = ? AND canonical_ref IS NULL`,
    ).bind(id).first<Record<string, unknown>>();
    if (!row) {
      return new Response(JSON.stringify({ ok: false, error: 'Not found' }), {
        status: 404,
        headers: { 'content-type': 'application/json' },
      });
    }
    const release = await fetchOfficialRelease(String(row.source_ref || ''));
    if (!release) {
      return new Response(JSON.stringify({ ok: true, skipped: true, patch: {} }), {
        headers: { 'content-type': 'application/json' },
      });
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
    return new Response(JSON.stringify({ ok: true, patch }), {
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
