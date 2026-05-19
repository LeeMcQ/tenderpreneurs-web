// Thin D1 helper — keeps SQL in one place and provides ULID generation.
// Importing pattern: `import { db, ulid, now } from "../lib/db";`

import type { D1Database } from "@cloudflare/workers-types";

export type Env = {
  DB: D1Database;
  R2_TENDERS: R2Bucket;
  PUBLIC_SITE_URL: string;
  SESSION_TTL_DAYS: string;
  MAGIC_LINK_TTL_MIN: string;
  AUDIT_EMAIL_TO: string;
  AUDIT_EMAIL_FROM: string;
  AUTH_EMAIL_FROM: string;
  OPENROUTER_API_KEY: string;
  GEMINI_API_KEY: string;
  GROQ_API_KEY: string;
  RESEND_API_KEY: string;
  MAGIC_LINK_SECRET: string;
  SESSION_SECRET: string;
};

/**
 * Get the D1 binding from Astro context. Use inside endpoint handlers:
 *   const env = getEnv(Astro);
 *   const tenders = await env.DB.prepare("SELECT ...").all();
 */
export function getEnv(astro: { locals: any }): Env {
  // Astro on Cloudflare exposes bindings via `Astro.locals.runtime.env`.
  // We narrow it once here so the rest of the code doesn't repeat the cast.
  const env = (astro.locals as any)?.runtime?.env;
  if (!env) {
    throw new Error("Cloudflare runtime env not available. Are you running on Pages?");
  }
  return env as Env;
}

/** ISO timestamp, second precision, suitable for D1 TEXT columns. */
export const now = () => new Date().toISOString().replace(/\.\d{3}Z$/, "Z");

/** Crockford-base32 ULID — 26 chars, sortable by time prefix. */
export function ulid(): string {
  const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
  const t = Date.now();
  let timeStr = "";
  let n = t;
  for (let i = 0; i < 10; i++) {
    timeStr = ALPHABET[n % 32] + timeStr;
    n = Math.floor(n / 32);
  }
  const rand = crypto.getRandomValues(new Uint8Array(16));
  let randStr = "";
  for (let i = 0; i < 16; i++) {
    randStr += ALPHABET[rand[i] % 32];
  }
  return timeStr + randStr;
}

/** SHA-256 hex (used for fingerprints and token hashes). */
export async function sha256(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Normalise text for fingerprinting (lowercase, collapse whitespace). */
export function normaliseForFingerprint(s: string): string {
  return s.toLowerCase().replace(/\s+/g, " ").trim();
}
