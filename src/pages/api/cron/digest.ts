import type { APIRoute } from 'astro';
import { getEnv, cronSecretMatches } from '../../../lib/db.js';
import { sendEmail } from '../../../lib/email.js';
import { ensureOpsSchema } from '../../../lib/ops-schema.js';
import { buildDigest, digestWhatsAppText } from '../../../lib/digest-build.js';
import { displayTitle } from '../../../lib/tender-display.js';

export const prerender = false;

export const POST: APIRoute = async (ctx) => {
  const env = getEnv(ctx);
  if (!cronSecretMatches(env, ctx.request.headers.get('x-cron-secret'))) {
    return new Response(JSON.stringify({ error: 'Unauthorised' }), { status: 401 });
  }

  await ensureOpsSchema(env.DB);

  const { results: searches = [] } = await env.DB.prepare(
    `SELECT s.id, s.user_id, s.q, s.province, s.sector, s.within_days, s.channel, u.email
     FROM saved_searches s
     JOIN users u ON u.id = s.user_id
     WHERE s.last_sent_at IS NULL OR s.last_sent_at < datetime('now', '-20 hours')
     LIMIT 25`,
  ).all<any>();

  let sent = 0;
  const outbound = String((env as any).OUTBOUND_ENABLED || '') === 'true';
  const key = (env as any).RESEND_API_KEY as string | undefined;
  const from = (env as any).ALERT_EMAIL_FROM || (env as any).AUDIT_EMAIL_FROM || 'Tenderpreneurs <onboarding@resend.dev>';

  for (const rule of searches) {
    const params: any[] = [];
    const where = [`status = 'open'`, `canonical_ref IS NULL`];
    if (rule.province) { where.push('province = ?'); params.push(rule.province); }
    if (rule.sector) { where.push('sector = ?'); params.push(rule.sector); }
    if (rule.q) {
      where.push('(title LIKE ? OR procuring_entity LIKE ? OR description LIKE ?)');
      const like = `%${String(rule.q).slice(0, 80)}%`;
      params.push(like, like, like);
    }
    const { results: hits = [] } = await env.DB.prepare(
      `SELECT id, title, source_ref, description, procuring_entity, closing_date, first_seen_at
       FROM tenders WHERE ${where.join(' AND ')}
       ORDER BY COALESCE(closing_date,'9999-12-31') ASC LIMIT 24`,
    ).bind(...params).all<any>();

    const notices = hits.map((t) => ({
      id: t.id,
      title: displayTitle(t),
      closing_date: t.closing_date,
      first_seen_at: t.first_seen_at,
      procuring_entity: t.procuring_entity,
    }));
    const bundle = buildDigest(notices, { closeDays: Number(rule.within_days) || 7, cap: 8 });
    const text = digestWhatsAppText(bundle);
    const count = bundle.closing.length + bundle.fresh.length;

    if (outbound && key && rule.email && rule.channel === 'email' && count) {
      try {
        await sendEmail({
          apiKey: key,
          from,
          to: rule.email,
          subject: `Tender digest · ${count} notice${count === 1 ? '' : 's'}`,
          text,
          html: `<pre style="font-family:inherit">${text}</pre><p><a href="https://tenderpreneurs.co.za/alerts">Manage</a></p>`,
        });
        sent += 1;
      } catch (err) {
        console.error('[digest] send', err);
      }
    }

    await env.DB.prepare(
      `UPDATE saved_searches SET last_sent_at = datetime('now') WHERE id = ?`,
    ).bind(rule.id).run();
    await env.DB.prepare(
      `INSERT INTO digest_log (user_id, channel, item_count) VALUES (?,?,?)`,
    ).bind(rule.user_id, rule.channel || 'email', count).run();
  }

  return new Response(JSON.stringify({ ok: true, rules: searches.length, sent }), {
    headers: { 'content-type': 'application/json' },
  });
};
