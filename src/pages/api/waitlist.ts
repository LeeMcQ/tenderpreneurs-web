import type { APIRoute } from "astro";

export const prerender = false;

// Minimal waitlist endpoint: validates input, logs to console (Cloudflare tail captures it).
// Replace the persistence block with Resend / D1 / KV / Mailchimp once you've picked a provider.
// Do NOT swallow errors silently in production — wire up Sentry or Cloudflare logs.

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export const POST: APIRoute = async ({ request, redirect }) => {
  let email = "";
  let hub = "";

  const contentType = request.headers.get("content-type") || "";

  try {
    if (contentType.includes("application/json")) {
      const body = await request.json();
      email = String(body.email || "").trim().toLowerCase();
      hub = String(body.hub || "unknown").trim();
    } else {
      const form = await request.formData();
      email = String(form.get("email") || "").trim().toLowerCase();
      hub = String(form.get("hub") || "unknown").trim();
    }
  } catch {
    return new Response(JSON.stringify({ ok: false, error: "invalid_body" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  if (!EMAIL_RE.test(email) || email.length > 254) {
    return new Response(JSON.stringify({ ok: false, error: "invalid_email" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  if (hub.length > 100) {
    return new Response(JSON.stringify({ ok: false, error: "invalid_hub" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  // TODO: persist (D1 / KV / Resend / Mailchimp). For now, log so it shows in `wrangler tail`.
  console.log(JSON.stringify({ event: "waitlist_signup", email, hub, at: new Date().toISOString() }));

  // Browser POSTs from the inline form should redirect to a thanks page.
  if (!contentType.includes("application/json")) {
    return redirect(`/tenders/thanks?hub=${encodeURIComponent(hub)}`, 303);
  }

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
};

export const GET: APIRoute = () =>
  new Response(JSON.stringify({ ok: false, error: "method_not_allowed" }), {
    status: 405,
    headers: { "content-type": "application/json", allow: "POST" },
  });
