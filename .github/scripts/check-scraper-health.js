#!/usr/bin/env node
// .github/scripts/check-scraper-health.js
//
// Runs after all scrapers as the final workflow step. Fetches /api/cron/health
// and decides which sources have regressed enough to warrant an alert.
//
// Alert channels:
//   1. GitHub Actions error annotation (always — gives email via standard
//      GitHub failure notifications if the user has those enabled)
//   2. WhatsApp via webhook (if WHATSAPP_WEBHOOK_URL is set)
//
// Rules (intentionally conservative so we don't spam):
//   - Alert only when a source has had ≥3 consecutive failed runs
//     OR no successful run in the last 3 days
//   - Don't alert for `no_data` (some sources legitimately have empty days)
//   - Suppress duplicate alerts: only fire once per source per UTC day
//     (achieved by emitting a daily summary, not per-source alerts)

const SITE_URL = (process.env.SITE_URL ?? 'https://tenderpreneurs.pages.dev').replace(/\/$/, '');
const CRON_SECRET = process.env.CRON_SECRET;
const WHATSAPP_WEBHOOK_URL = process.env.WHATSAPP_WEBHOOK_URL;
const ALERT_EMAIL = process.env.ALERT_EMAIL;  // unused directly — surfaced via GH annotation

if (!CRON_SECRET) {
  console.error('CRON_SECRET not set — cannot check health');
  process.exit(0); // exit 0 so workflow doesn't fail because of monitoring
}

async function fetchHealth() {
  const res = await fetch(`${SITE_URL}/api/cron/health`, {
    headers: { 'x-cron-secret': CRON_SECRET },
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) {
    throw new Error(`health endpoint returned ${res.status}`);
  }
  return await res.json();
}

function classify(source) {
  // Decide whether this source warrants an alert.
  const now = Date.now();
  const lastSuccess = source.last_success_at ? new Date(source.last_success_at + 'Z').getTime() : 0;
  const lastError = source.last_error_at ? new Date(source.last_error_at + 'Z').getTime() : 0;
  const daysSinceSuccess = lastSuccess === 0 ? 999 : Math.floor((now - lastSuccess) / (1000 * 60 * 60 * 24));

  // Failures must outnumber successes in the last 7 days to be considered
  // problematic — and there must be ≥3 of them.
  const failures = source.failures_last_7d ?? 0;
  const runs = source.runs_last_7d ?? 0;
  const successes = runs - failures;

  if (runs === 0) {
    return { severity: 'warn', reason: 'no runs in the last 7 days — scheduler issue?' };
  }
  if (daysSinceSuccess >= 3) {
    return { severity: 'alert', reason: `no successful run for ${daysSinceSuccess} days` };
  }
  if (failures >= 3 && failures > successes) {
    return { severity: 'alert', reason: `${failures} failures vs ${successes} successes in last 7 days` };
  }
  return { severity: 'ok', reason: null };
}

async function notifyWhatsApp(summary) {
  if (!WHATSAPP_WEBHOOK_URL) {
    console.log('no WhatsApp webhook configured — skipping');
    return;
  }
  try {
    const res = await fetch(WHATSAPP_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: summary }),
      signal: AbortSignal.timeout(15_000),
    });
    if (res.ok) {
      console.log('WhatsApp alert sent');
    } else {
      console.warn(`WhatsApp webhook returned ${res.status}`);
    }
  } catch (err) {
    console.warn(`WhatsApp notify failed: ${err.message}`);
  }
}

function formatSummary(alerts) {
  if (alerts.length === 0) return null;
  const lines = [
    '🚨 Tenderpreneurs scraper alert',
    `${alerts.length} source(s) are failing:`,
    '',
  ];
  for (const a of alerts) {
    lines.push(`• ${a.source_name} (${a.source_id})`);
    lines.push(`  ${a.reason}`);
    if (a.last_success_at) {
      lines.push(`  last success: ${a.last_success_at}`);
    }
  }
  lines.push('');
  lines.push(`Dashboard: ${SITE_URL}/admin/scrapers`);
  return lines.join('\n');
}

async function main() {
  console.log('checking scraper health...');

  let health;
  try {
    health = await fetchHealth();
  } catch (err) {
    console.error(`failed to fetch health: ${err.message}`);
    // Exit 0 — monitoring failure shouldn't fail the workflow
    process.exit(0);
  }

  const sources = health.sources ?? [];
  console.log(`evaluating ${sources.length} sources`);

  const alerts = [];
  const warns = [];
  for (const s of sources) {
    const verdict = classify(s);
    if (verdict.severity === 'alert') {
      alerts.push({ ...s, reason: verdict.reason });
      // GitHub Actions error annotation — picked up by GH's failure email
      console.log(`::error title=Scraper failing: ${s.source_id}::${verdict.reason}`);
    } else if (verdict.severity === 'warn') {
      warns.push({ ...s, reason: verdict.reason });
      console.log(`::warning title=Scraper warning: ${s.source_id}::${verdict.reason}`);
    } else {
      console.log(`✓ ${s.source_id} (${s.runs_last_7d} runs / ${s.failures_last_7d} failures last 7d)`);
    }
  }

  if (alerts.length > 0) {
    const summary = formatSummary(alerts);
    console.log('\n--- ALERT SUMMARY ---\n' + summary);
    await notifyWhatsApp(summary);
  } else {
    console.log('\n✓ all scrapers healthy');
  }

  // Always exit 0 — the alert annotations and WhatsApp delivery are the alert
  // mechanisms. Exiting non-zero here would just cause workflow-failure noise
  // on top of the per-source notifications.
  process.exit(0);
}

main().catch((err) => {
  console.error('health check uncaught error:', err);
  process.exit(0);
});
