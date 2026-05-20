// PayFast (South Africa) helper for Cloudflare Workers / Pages.
//
// Implements:
//   - Plan catalogue (monthly & annual)
//   - MD5 signature generation (PayFast's documented spec)
//   - ITN signature verification
//   - Server-to-server ITN validation (POST to PayFast)
//   - PayFast source IP allow-list
//
// Reference: https://developers.payfast.co.za/docs

import type { D1Database } from "@cloudflare/workers-types";

export type PayFastMode = "sandbox" | "live";

export interface PayFastEnv {
  PAYFAST_MERCHANT_ID: string;
  PAYFAST_MERCHANT_KEY: string;
  PAYFAST_PASSPHRASE: string;
  PAYFAST_MODE: string; // 'sandbox' | 'live'
  PUBLIC_SITE_URL: string;
}

// ----------------------------------------------------------------------
// Endpoints
// ----------------------------------------------------------------------

export function processUrl(mode: PayFastMode): string {
  return mode === "live"
    ? "https://www.payfast.co.za/eng/process"
    : "https://sandbox.payfast.co.za/eng/process";
}

export function validateUrl(mode: PayFastMode): string {
  return mode === "live"
    ? "https://www.payfast.co.za/eng/query/validate"
    : "https://sandbox.payfast.co.za/eng/query/validate";
}

export function getMode(env: PayFastEnv): PayFastMode {
  return env.PAYFAST_MODE === "live" ? "live" : "sandbox";
}

// ----------------------------------------------------------------------
// Plan catalogue — change here, every page reflects it.
// Amounts are in ZAR cents to avoid float issues.
// ----------------------------------------------------------------------

export interface Plan {
  id: string;
  name: string;
  amount_zar_cents: number;
  billing_cycle: "monthly" | "annual";
  frequency: 3 | 6;          // PayFast subscription_type=1: 3=monthly, 6=annual
  cycles: number;            // 0 = until cancelled
}

export const PLANS: Record<string, Plan> = {
  pro_monthly: {
    id: "pro_monthly",
    name: "Tenderpreneurs Professional (Monthly)",
    amount_zar_cents: 29900, // R299.00
    billing_cycle: "monthly",
    frequency: 3,
    cycles: 0,
  },
  pro_annual: {
    id: "pro_annual",
    name: "Tenderpreneurs Professional (Annual)",
    amount_zar_cents: 299000, // R2,990.00 — 2 months free
    billing_cycle: "annual",
    frequency: 6,
    cycles: 0,
  },
};

export function getPlan(id: string | null | undefined): Plan | null {
  if (!id) return null;
  return PLANS[id] || null;
}

export function zarFromCents(cents: number): string {
  return (cents / 100).toFixed(2);
}

// ----------------------------------------------------------------------
// Signature
// ----------------------------------------------------------------------

// MD5 — small implementation (PayFast still requires MD5 for signatures).
// This is not used for any security primitive — only for compatibility with
// PayFast's signature spec. Real security comes from the passphrase + HTTPS + IP allowlist.
function md5(input: string): string {
  // Minimal MD5 implementation. Public-domain algorithm.
  function rh(n: number): string {
    let s = "";
    for (let j = 0; j < 4; j++) {
      s += ((n >> (j * 8 + 4)) & 0x0f).toString(16) + ((n >> (j * 8)) & 0x0f).toString(16);
    }
    return s;
  }
  function ad(x: number, y: number): number { return (x + y) & 0xffffffff; }
  function rl(n: number, c: number): number { return (n << c) | (n >>> (32 - c)); }
  function cm(q: number, a: number, b: number, x: number, s: number, t: number): number {
    return ad(rl(ad(ad(a, q), ad(x, t)), s), b);
  }
  function ff(a: number, b: number, c: number, d: number, x: number, s: number, t: number) {
    return cm((b & c) | (~b & d), a, b, x, s, t);
  }
  function gg(a: number, b: number, c: number, d: number, x: number, s: number, t: number) {
    return cm((b & d) | (c & ~d), a, b, x, s, t);
  }
  function hh(a: number, b: number, c: number, d: number, x: number, s: number, t: number) {
    return cm(b ^ c ^ d, a, b, x, s, t);
  }
  function ii(a: number, b: number, c: number, d: number, x: number, s: number, t: number) {
    return cm(c ^ (b | ~d), a, b, x, s, t);
  }
  function c2b(str: string): number[] {
    const bytes: number[] = [];
    // UTF-8 encode
    for (let i = 0; i < str.length; i++) {
      let c = str.charCodeAt(i);
      if (c < 0x80) bytes.push(c);
      else if (c < 0x800) { bytes.push(0xc0 | (c >> 6)); bytes.push(0x80 | (c & 0x3f)); }
      else { bytes.push(0xe0 | (c >> 12)); bytes.push(0x80 | ((c >> 6) & 0x3f)); bytes.push(0x80 | (c & 0x3f)); }
    }
    const nblk = ((bytes.length + 8) >> 6) + 1;
    const blks = new Array(nblk * 16).fill(0);
    for (let i = 0; i < bytes.length; i++) blks[i >> 2] |= bytes[i] << ((i % 4) * 8);
    blks[bytes.length >> 2] |= 0x80 << ((bytes.length % 4) * 8);
    blks[nblk * 16 - 2] = bytes.length * 8;
    return blks;
  }

  const x = c2b(input);
  let a = 1732584193, b = -271733879, c = -1732584194, d = 271733878;
  for (let i = 0; i < x.length; i += 16) {
    const oa = a, ob = b, oc = c, od = d;
    a = ff(a, b, c, d, x[i + 0], 7, -680876936);
    d = ff(d, a, b, c, x[i + 1], 12, -389564586);
    c = ff(c, d, a, b, x[i + 2], 17, 606105819);
    b = ff(b, c, d, a, x[i + 3], 22, -1044525330);
    a = ff(a, b, c, d, x[i + 4], 7, -176418897);
    d = ff(d, a, b, c, x[i + 5], 12, 1200080426);
    c = ff(c, d, a, b, x[i + 6], 17, -1473231341);
    b = ff(b, c, d, a, x[i + 7], 22, -45705983);
    a = ff(a, b, c, d, x[i + 8], 7, 1770035416);
    d = ff(d, a, b, c, x[i + 9], 12, -1958414417);
    c = ff(c, d, a, b, x[i + 10], 17, -42063);
    b = ff(b, c, d, a, x[i + 11], 22, -1990404162);
    a = ff(a, b, c, d, x[i + 12], 7, 1804603682);
    d = ff(d, a, b, c, x[i + 13], 12, -40341101);
    c = ff(c, d, a, b, x[i + 14], 17, -1502002290);
    b = ff(b, c, d, a, x[i + 15], 22, 1236535329);
    a = gg(a, b, c, d, x[i + 1], 5, -165796510);
    d = gg(d, a, b, c, x[i + 6], 9, -1069501632);
    c = gg(c, d, a, b, x[i + 11], 14, 643717713);
    b = gg(b, c, d, a, x[i + 0], 20, -373897302);
    a = gg(a, b, c, d, x[i + 5], 5, -701558691);
    d = gg(d, a, b, c, x[i + 10], 9, 38016083);
    c = gg(c, d, a, b, x[i + 15], 14, -660478335);
    b = gg(b, c, d, a, x[i + 4], 20, -405537848);
    a = gg(a, b, c, d, x[i + 9], 5, 568446438);
    d = gg(d, a, b, c, x[i + 14], 9, -1019803690);
    c = gg(c, d, a, b, x[i + 3], 14, -187363961);
    b = gg(b, c, d, a, x[i + 8], 20, 1163531501);
    a = gg(a, b, c, d, x[i + 13], 5, -1444681467);
    d = gg(d, a, b, c, x[i + 2], 9, -51403784);
    c = gg(c, d, a, b, x[i + 7], 14, 1735328473);
    b = gg(b, c, d, a, x[i + 12], 20, -1926607734);
    a = hh(a, b, c, d, x[i + 5], 4, -378558);
    d = hh(d, a, b, c, x[i + 8], 11, -2022574463);
    c = hh(c, d, a, b, x[i + 11], 16, 1839030562);
    b = hh(b, c, d, a, x[i + 14], 23, -35309556);
    a = hh(a, b, c, d, x[i + 1], 4, -1530992060);
    d = hh(d, a, b, c, x[i + 4], 11, 1272893353);
    c = hh(c, d, a, b, x[i + 7], 16, -155497632);
    b = hh(b, c, d, a, x[i + 10], 23, -1094730640);
    a = hh(a, b, c, d, x[i + 13], 4, 681279174);
    d = hh(d, a, b, c, x[i + 0], 11, -358537222);
    c = hh(c, d, a, b, x[i + 3], 16, -722521979);
    b = hh(b, c, d, a, x[i + 6], 23, 76029189);
    a = hh(a, b, c, d, x[i + 9], 4, -640364487);
    d = hh(d, a, b, c, x[i + 12], 11, -421815835);
    c = hh(c, d, a, b, x[i + 15], 16, 530742520);
    b = hh(b, c, d, a, x[i + 2], 23, -995338651);
    a = ii(a, b, c, d, x[i + 0], 6, -198630844);
    d = ii(d, a, b, c, x[i + 7], 10, 1126891415);
    c = ii(c, d, a, b, x[i + 14], 15, -1416354905);
    b = ii(b, c, d, a, x[i + 5], 21, -57434055);
    a = ii(a, b, c, d, x[i + 12], 6, 1700485571);
    d = ii(d, a, b, c, x[i + 3], 10, -1894986606);
    c = ii(c, d, a, b, x[i + 10], 15, -1051523);
    b = ii(b, c, d, a, x[i + 1], 21, -2054922799);
    a = ii(a, b, c, d, x[i + 8], 6, 1873313359);
    d = ii(d, a, b, c, x[i + 15], 10, -30611744);
    c = ii(c, d, a, b, x[i + 6], 15, -1560198380);
    b = ii(b, c, d, a, x[i + 13], 21, 1309151649);
    a = ii(a, b, c, d, x[i + 4], 6, -145523070);
    d = ii(d, a, b, c, x[i + 11], 10, -1120210379);
    c = ii(c, d, a, b, x[i + 2], 15, 718787259);
    b = ii(b, c, d, a, x[i + 9], 21, -343485551);
    a = ad(a, oa); b = ad(b, ob); c = ad(c, oc); d = ad(d, od);
  }
  return rh(a) + rh(b) + rh(c) + rh(d);
}

/**
 * Build a PayFast signature.
 *
 * Spec:
 *   1. Take all fields except `signature`, in the order they appear in the form
 *      (or alphabetically for ITN — PayFast accepts either as long as we're consistent).
 *      We use **insertion order** because PayFast's official docs specify that.
 *   2. urlencode each value (spaces as +, not %20 — PHP's http_build_query default).
 *   3. Join with &.
 *   4. Append &passphrase=urlencode(passphrase) if passphrase is set.
 *   5. MD5 the result.
 */
export function generateSignature(
  fields: Record<string, string>,
  passphrase: string
): string {
  const pairs: string[] = [];
  for (const [k, v] of Object.entries(fields)) {
    if (k === "signature") continue;
    if (v === undefined || v === null || v === "") continue;
    // PayFast uses PHP's http_build_query encoding (spaces → +)
    const encoded = encodeURIComponent(String(v)).replace(/%20/g, "+");
    pairs.push(`${k}=${encoded}`);
  }
  let qs = pairs.join("&");
  if (passphrase) {
    qs += `&passphrase=${encodeURIComponent(passphrase).replace(/%20/g, "+")}`;
  }
  return md5(qs);
}

// ----------------------------------------------------------------------
// ITN verification
// ----------------------------------------------------------------------

const PAYFAST_LIVE_IPS = [
  "www.payfast.co.za",
  "sandbox.payfast.co.za",
  "w1w.payfast.co.za",
  "w2w.payfast.co.za",
];

const PAYFAST_LIVE_HOSTS_RESOLVED = [
  // PayFast publishes these IP blocks — verified Jan 2026. Update from
  // https://developers.payfast.co.za/docs#ip-addresses if they change.
  "197.97.145.144",
  "197.97.145.145",
  "197.97.145.146",
  "197.97.145.147",
  "197.97.145.148",
  "197.97.145.149",
  "197.97.145.150",
  "197.97.145.151",
  "41.74.179.192",
  "41.74.179.193",
  "41.74.179.194",
  "41.74.179.195",
  "41.74.179.196",
  "41.74.179.197",
  "41.74.179.198",
  "41.74.179.199",
];

export function isPayFastIP(remoteIp: string | null, mode: PayFastMode): boolean {
  // In sandbox mode we don't restrict — PayFast's sandbox doesn't publish stable IPs.
  if (mode === "sandbox") return true;
  if (!remoteIp) return false;
  return PAYFAST_LIVE_HOSTS_RESOLVED.includes(remoteIp);
}

export function verifyItnSignature(
  fields: Record<string, string>,
  passphrase: string
): boolean {
  const received = fields.signature;
  if (!received) return false;
  const computed = generateSignature(fields, passphrase);
  return received === computed;
}

export async function serverValidateItn(
  fields: Record<string, string>,
  mode: PayFastMode
): Promise<boolean> {
  const body = new URLSearchParams();
  for (const [k, v] of Object.entries(fields)) {
    if (v === undefined || v === null) continue;
    body.append(k, String(v));
  }
  const res = await fetch(validateUrl(mode), {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  if (!res.ok) return false;
  const text = (await res.text()).trim();
  return text === "VALID";
}

// ----------------------------------------------------------------------
// Idempotency helper for subscriptions
// ----------------------------------------------------------------------

export function newMPaymentId(userId: string, plan: string): string {
  // Format: tp_<userIdLast8>_<plan>_<timestamp>
  const ts = Date.now().toString(36);
  return `tp_${userId.slice(-8)}_${plan}_${ts}`;
}

// ----------------------------------------------------------------------
// Subscription helpers (D1)
// ----------------------------------------------------------------------

export async function getActiveSubscription(
  db: D1Database,
  userId: string
): Promise<{ id: string; plan: string; status: string; current_period_end: string | null } | null> {
  return await db
    .prepare(
      `SELECT id, plan, status, current_period_end
       FROM subscriptions
       WHERE user_id = ? AND status IN ('active','past_due')
       ORDER BY created_at DESC LIMIT 1`
    )
    .bind(userId)
    .first();
}
