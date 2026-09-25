// Pages scheduled handler. Cron expression picks the job.
export default {
  async scheduled(event: ScheduledEvent, env: any, ctx: ExecutionContext): Promise<void> {
    const base = env.PUBLIC_SITE_URL || "https://tenderpreneurs.co.za";
    const secret = env.CRON_SECRET || env.SESSION_SECRET;

    if (!secret) {
      console.error("No CRON_SECRET or SESSION_SECRET — scheduled task skipped");
      return;
    }

    const path =
      event.cron === "30 7 * * *" ? "/api/cron/audit"
      : event.cron === "0 8 * * *" ? "/api/cron/closing-alerts"
      : "/api/cron/ingest";

    ctx.waitUntil(
      fetch(`${base}${path}`, {
        method: "POST",
        headers: { "x-cron-secret": secret },
      })
        .then((res) => {
          if (!res.ok) console.error(`Scheduled ${path} failed: ${res.status}`);
        })
        .catch((err) => {
          console.error(`Scheduled ${path} error: ${err.message}`);
        }),
    );
  },
};
