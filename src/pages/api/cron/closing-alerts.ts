import type { APIRoute } from 'astro';
import { getEnv, cronSecretMatches } from '../../../lib/db';
import { sendEmail } from '../../../lib/email';
import { sentenceFor } from '../../../lib/alerts/closing';
import { displayTitle } from '../../../lib/tender-display';

export const prerender = false;

export const POST: APIRoute = async (ctx) => {
  const env = getEnv(ctx);
  if (!cronSecretMatches(env, ctx.request.headers.get('x-cron-secret'))) {
    return new Response(JSON.stringify({ error: 'Unauthorised' }), { status: 401 });
  }

  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS closing_alerts (
       user_id TEXT NOT NULL,
       province TEXT NOT NULL DEFAULT '',
       sector TEXT NOT NULL DEFAULT '',
       within_days INTEGER NOT NULL DEFAULT 7,
       phone TEXT,
       last_sent_at TEXT,
       created_at TEXT NOT NULL DEFAULT (datetime('now')),
       PRIMARY KEY (user_id, province, sector, within_days)
     )`,
  ).run();

  const { results: rules = [] } = await env.DB.prepare(
    `SELECT a.user_id, a.province, a.sector, a.within_days, a.phone, u.email
     FROM closing_alerts a
     JOIN users u ON u.id = a.user_id
     WHERE a.last_sent_at IS NULL OR a.last_sent_at < datetime('now', '-20 hours')
     LIMIT 25`,
  ).all<any>();

  let sent = 0;
  const from = (env as any).ALERT_EMAIL_FROM || (env as any).AUDIT_EMAIL_FROM || 'Tenderpreneurs <onboarding@resend.dev>';
  const key = (env as any).RESEND_API_KEY as string | undefined;

  for (const rule of rules) {
    const params: any[] = [];
    let where = `status = 'open' AND canonical_ref IS NULL AND closing_date IS NOT NULL AND date(closing_date) >= date('now') AND date(closing_date) <= date('now', ?)`;
    params.push(`+${Number(rule.within_days) || 7} day`);
    if (rule.province) { where += ' AND province = ?'; params.push(rule.province); }
    if (rule.sector) { where += ' AND sector = ?'; params.push(rule.sector); }
    const { results: hits = [] } = await env.DB.prepare(
      `SELECT id, title, source_ref, description, closing_date FROM tenders WHERE ${where} ORDER BY closing_date ASC LIMIT 8`,
    ).bind(...params).all<any>();

    const line = sentenceFor(
      { province: rule.province, sector: rule.sector, within: Number(rule.within_days) || 7 },
      hits.length,
    );
    const links = hits.map((t) => `- ${displayTitle(t)} — https://tenderpreneurs.co.za/tenders/t/${t.id}`).join('\n');
    const text = `${line}\n\n${links || 'No matching open notices today.'}\n\nManage: https://tenderpreneurs.co.za/alerts`;

    if (key && rule.email) {
      try {
        await sendEmail({
          apiKey: key,
          from,
          to: rule.email,
          subject: line,
          text,
          html: `<p>${line}</p><pre style="font-family:inherit">${links || 'No matching open notices today.'}</pre><p><a href="https://tenderpreneurs.co.za/alerts">Manage alert</a></p>`,
        });
        sent += 1;
      } catch (err) {
        console.error('[closing-alerts] send', err);
      }
    }

    await env.DB.prepare(
      `UPDATE closing_alerts SET last_sent_at = datetime('now')
       WHERE user_id = ? AND province = ? AND sector = ? AND within_days = ?`,
    ).bind(rule.user_id, rule.province, rule.sector, rule.within_days).run();
  }

  return new Response(JSON.stringify({ ok: true, rules: rules.length, sent }), {
    headers: { 'content-type': 'application/json' },
  });
};
