// src/pages/api/waitlist.ts
// POST endpoint that captures emails for the "Notify me when tenders go live" form.
// Stores in Cloudflare KV (binding: WAITLIST) AND sends a confirmation email via Resend.
//
// Cloudflare Pages → Settings → Functions → KV namespace bindings:
//   Variable name: WAITLIST   →  bind to a KV namespace you create
// Cloudflare Pages → Settings → Environment variables:
//   RESEND_API_KEY = re_xxx
//   WAITLIST_FROM_EMAIL = "Tenderpreneurs <hello@tenderpreneurs.co.za>"

import type { APIRoute } from "astro";

export const prerender = false; // must run on the server, not at build time

interface WaitlistPayload {
  email?: string;
  source?: string;       // e.g. "tenders-page" or "homepage-footer"
  honeypot?: string;     // bot trap; real users leave this blank
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const POST: APIRoute = async ({ request, locals }) => {
  // 1. Parse + validate
  let body: WaitlistPayload;
  try {
    body = (await request.json()) as WaitlistPayload;
  } catch {
    return json({ ok: false, error: "Invalid JSON" }, 400);
  }

  // Honeypot — silent success so bots don't learn
  if (body.honeypot) {
    return json({ ok: true });
  }

  const email = (body.email ?? "").trim().toLowerCase();
  if (!EMAIL_RE.test(email)) {
    return json({ ok: false, error: "Please enter a valid email address." }, 400);
  }
  if (email.length > 254) {
    return json({ ok: false, error: "Email too long." }, 400);
  }

  const source = (body.source ?? "unknown").slice(0, 64);
  const submittedAt = new Date().toISOString();

  // 2. Persist to Cloudflare KV (best-effort — don't fail user if KV is down)
  // The Cloudflare runtime exposes bindings on `locals.runtime.env` via the adapter.
  // Adjust the access path to match your astro.config.mjs runtime mode.
  try {
    // @ts-expect-error — runtime env is injected by the Cloudflare adapter
    const kv = locals?.runtime?.env?.WAITLIST as KVNamespace | undefined;
    if (kv) {
      const key = `waitlist:${email}`;
      const existing = await kv.get(key);
      if (!existing) {
        await kv.put(
          key,
          JSON.stringify({ email, source, submittedAt }),
          // Optional: 2-year TTL. Remove if you want indefinite storage.
          { expirationTtl: 60 * 60 * 24 * 365 * 2 }
        );
      }
    }
  } catch (err) {
    console.error("[waitlist] KV write failed:", err);
  }

  // 3. Send confirmation email via Resend (also best-effort)
  try {
    // @ts-expect-error — runtime env is injected by the Cloudflare adapter
    const apiKey = locals?.runtime?.env?.RESEND_API_KEY as string | undefined;
    // @ts-expect-error
    const fromEmail =
      (locals?.runtime?.env?.WAITLIST_FROM_EMAIL as string | undefined) ??
      "Tenderpreneurs <hello@tenderpreneurs.co.za>";

    if (apiKey) {
      await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: fromEmail,
          to: [email],
          subject: "You're on the Tenderpreneurs waitlist 🇿🇦",
          html: confirmationHtml(),
        }),
      });
    }
  } catch (err) {
    console.error("[waitlist] Resend send failed:", err);
  }

  return json({ ok: true, message: "You're on the list. We'll be in touch." });
};

// Reject anything that isn't POST
export const GET: APIRoute = () => json({ ok: false, error: "Method not allowed" }, 405);

// ─── helpers ──────────────────────────────────────────────────

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
}

function confirmationHtml(): string {
  return `<!doctype html>
<html><body style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;line-height:1.6;color:#0C1B33;max-width:560px;margin:0 auto;padding:24px;">
  <h1 style="color:#0C1B33;font-size:24px;margin-bottom:16px;">You're on the list ✓</h1>
  <p>Thanks for signing up to the Tenderpreneurs waitlist. We'll notify you the moment the live tender feed goes live — covering all 9 provinces and 257 municipalities.</p>
  <p>While you wait, you can already use:</p>
  <ul>
    <li><a href="https://tenderpreneurs.co.za/pfma" style="color:#0C1B33;">The free PFMA Knowledge Base</a> — 11 topics, every claim cited to the actual legislation.</li>
    <li><a href="https://tenderpreneurs.co.za/blog" style="color:#0C1B33;">The Tenderpreneurs blog</a> — CSD registration, B-BBEE, and bid-writing guides.</li>
  </ul>
  <p style="color:#666;font-size:13px;margin-top:32px;">POPIA: we keep only your email address and signup source. Reply with "remove" to be deleted from the list.</p>
  <p style="color:#666;font-size:13px;">— Tenderpreneurs (Pty) Ltd · tenderpreneurs.co.za</p>
</body></html>`;
}
