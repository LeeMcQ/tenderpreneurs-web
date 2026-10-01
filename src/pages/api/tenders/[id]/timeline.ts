import type { APIRoute } from 'astro';

export const prerender = false;

function iso(v: unknown) {
  if (!v) return null;
  const s = String(v).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
}

function envOf(context: any) {
  const locals = context?.locals;
  return locals?.runtime?.env ?? locals?.env ?? null;
}

export const GET: APIRoute = async (context) => {
  try {
    const env = envOf(context);
    const id = context.params.id;
    if (!id) return json({ ok: false, error: 'missing_id' }, 404);
    if (!env?.DB) return json({ ok: false, error: 'no_db' }, 503);
    const row = await env.DB.prepare(
      `SELECT id, published_date, briefing_date, briefing_time, briefing_location, briefing_compulsory,
              closing_date, closing_time, source_url, description, cidb_grade, estimated_value, source_ref
       FROM tenders WHERE id = ?`,
    ).bind(id).first();
    if (!row) return json({ ok: false, error: 'not_found' }, 404);
    const published = iso(row.published_date);
    const briefing = iso(row.briefing_date);
    const closing = iso(row.closing_date);
    const events = [
      { key: 'advert', label: 'Advertised', date: published, detail: 'Notice published. Minimum open window is usually 21 working days.' },
      { key: 'briefing', label: row.briefing_compulsory ? 'Compulsory briefing' : 'Briefing', date: briefing, detail: [row.briefing_time, row.briefing_location].filter(Boolean).join(' · ') || 'Venue and time are on the official pack.' },
      { key: 'questions', label: 'Questions / addenda', date: null, detail: 'Clarifications usually close before the bid. Late addenda can move the closing date.' },
      { key: 'close', label: 'Closing', date: closing, detail: row.closing_time ? row.closing_time + ' SAST' : 'Time on the official notice.' },
    ];
    const fields = [
      ['Closing date', !!closing],
      ['Closing time', !!row.closing_time],
      ['Briefing date', !!briefing],
      ['Briefing venue', !!row.briefing_location],
      ['Official link', !!row.source_url],
      ['Scope text', !!row.description],
      ['CIDB', !!row.cidb_grade],
      ['Value', row.estimated_value != null],
      ['Bid number', !!row.source_ref],
    ];
    return json({
      ok: true,
      compulsory: !!row.briefing_compulsory,
      events,
      coverage: fields.map(([label, ok]) => ({ label, ok })),
    });
  } catch (err) {
    return json({ ok: false, error: String(err).slice(0, 400) }, 500);
  }
};
