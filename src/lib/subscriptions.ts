/**
 * src/lib/subscriptions.ts
 * Entity opt-in helpers. Opt-out tokens are stateless (signed payload), so no
 * extra schema is needed — the unsubscribe link verifies against a secret.
 * PURE / testable (uses Web Crypto, available in Workers and Node 20+).
 */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normaliseEmail(e: string | null | undefined): string | null {
  if (!e) return null;
  const v = e.trim().toLowerCase();
  return EMAIL_RE.test(v) ? v : null;
}

function b64urlEncode(s: string): string {
  const b64 = btoa(unescape(encodeURIComponent(s)));
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function b64urlDecode(s: string): string {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/');
  return decodeURIComponent(escape(atob(b64)));
}

async function sha256hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}

/** token = base64url("entity|email") + "." + sha256(payload|secret) */
export async function makeOptOutToken(entity: string, email: string, secret: string): Promise<string> {
  const payload = `${entity}|${email}`;
  const sig = await sha256hex(`${payload}|${secret}`);
  return `${b64urlEncode(payload)}.${sig}`;
}

export async function verifyOptOutToken(token: string, secret: string): Promise<{ entity: string; email: string } | null> {
  if (!token || !token.includes('.')) return null;
  const [enc, sig] = token.split('.');
  let payload: string;
  try { payload = b64urlDecode(enc); } catch { return null; }
  const expected = await sha256hex(`${payload}|${secret}`);
  // constant-time-ish compare
  if (!sig || sig.length !== expected.length) return null;
  let diff = 0;
  for (let i = 0; i < sig.length; i++) diff |= sig.charCodeAt(i) ^ expected.charCodeAt(i);
  if (diff !== 0) return null;
  const idx = payload.indexOf('|');
  if (idx === -1) return null;
  return { entity: payload.slice(0, idx), email: payload.slice(idx + 1) };
}
