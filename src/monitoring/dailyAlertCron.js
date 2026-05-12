const cron = require("node-cron");
const { Resend } = require("resend");

/**
 * Starts the daily alert cron.
 *
 * @param {object}   opts
 * @param {object}   opts.db             Database client (Knex or similar)
 * @param {string}   opts.resendApiKey   Resend API key
 *
 * The database is expected to contain these tables (adjust queries to your schema):
 *   - tenders : with a `created_at` column marking the import time
 *   - request_logs : with `timestamp`, `status_code` (or a similar event table)
 *   - payment_webhooks : with `status`, `created_at` (status = 'failed' for failures)
 */
function startDailyAlertCron({ db, resendApiKey } = {}) {
  if (!db || !resendApiKey) {
    console.error("dailyAlertCron: db and resendApiKey are required.");
    return;
  }

  const resend = new Resend(resendApiKey);
  const adminEmail = process.env.ADMIN_EMAIL;

  if (!adminEmail) {
    console.error("dailyAlertCron: ADMIN_EMAIL env variable is not set.");
    return;
  }

  // 9:00 AM SAST = 7:00 UTC
  cron.schedule("0 7 * * *", async () => {
    try {
      const alerts = [];

      // ---- 1. No tenders imported in last 24 hours ----
      const [lastImportRow] = await db.raw(
        `SELECT MAX(created_at) AS last_import FROM tenders WHERE created_at >= NOW() - INTERVAL '24 hours'`
      );
      // Adjust for your flavour of SQL; for SQLite: `SELECT MAX(created_at) FROM tenders WHERE created_at >= datetime('now', '-1 day')`
      const lastImport = lastImportRow?.rows?.[0]?.last_import;

      if (!lastImport) {
        alerts.push("❌ No tenders imported in the last 24 hours.");
      }

      // ---- 2. Error rate > 5% in the last hour ----
      const [errorRateResult] = await db.raw(`
        SELECT
          COUNT(*) FILTER (WHERE status_code >= 500)::float / NULLIF(COUNT(*), 0) AS error_rate
        FROM request_logs
        WHERE timestamp >= NOW() - INTERVAL '1 hour'
      `);
      const errorRate = errorRateResult?.rows?.[0]?.error_rate;
      if (errorRate !== undefined && errorRate > 0.05) {
        alerts.push(`⚠️ Error rate >5% in the last hour: ${(errorRate * 100).toFixed(1)}%`);
      }

      // ---- 3. Any payment webhook failed ----
      const [webhookFails] = await db.raw(`
        SELECT COUNT(*) AS failed_count
        FROM payment_webhooks
        WHERE status = 'failed' AND created_at >= NOW() - INTERVAL '24 hours'
      `);
      const failedCount = webhookFails?.rows?.[0]?.failed_count;
      if (failedCount > 0) {
        alerts.push(`💳 ${failedCount} payment webhook(s) failed in the last 24 hours.`);
      }

      // If there is at least one alert, send an email
      if (alerts.length > 0) {
        const subject = `[tenderpreneurs] Daily Alert (${new Date().toISOString().slice(0, 10)})`;
        const body = alerts.join("\n\n");

        await resend.emails.send({
          from: "alerts@tenderpreneurs.co.za",
          to: adminEmail,
          subject,
          text: body,
        });

        console.log(`Daily alert email sent to ${adminEmail} – ${alerts.length} issue(s).`);
      }
    } catch (err) {
      console.error("Daily alert cron failed:", err);
    }
  });

  console.log("Daily alert cron scheduled (9:00 SAST).");
}

module.exports = { startDailyAlertCron };