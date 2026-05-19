// Cloudflare scheduled-handler entry.
//
// Pages Functions don't natively support `scheduled()`, so we hand the cron
// triggers off by having the scheduled handler internally fetch the cron
// endpoints with the shared secret. Cloudflare picks this up because
// wrangler.toml has [triggers] crons defined.
//
// If you later split this into a dedicated Worker, move this file there
// and point wrangler.toml `main = "_worker.ts"`.

export default {
  async scheduled(event: ScheduledEvent, env: any, ctx: ExecutionContext): Promise<void> {
    const base = env.PUBLIC_SITE_URL || "https://tenderpreneurs.co.za";
    const secret = env.SESSION_SECRET;

    if (!secret) {
      console.error("SESSION_SECRET not set — scheduled task skipped");
      return;
    }

    // Cron-name dispatch: the cron expression itself decides which job runs.
    // 0 */6 * * *   → ingest
    // 30 7 * * *    → audit
    const isAuditCron = event.cron === "30 7 * * *";
    const path = isAuditCron ? "/api/cron/audit" : "/api/cron/ingest";

    ctx.waitUntil(
      fetch(`${base}${path}`, {
        method: "POST",
        headers: { "x-cron-secret": secret },
      })
        .then((res) => {
          if (!res.ok) {
            console.error(`Scheduled ${path} failed: ${res.status}`);
          }
        })
        .catch((err) => {
          console.error(`Scheduled ${path} error: ${err.message}`);
        })
    );
  },
};
