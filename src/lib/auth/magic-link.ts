// Magic-link auth.
//
// Flow:
//   1. User submits email → POST /api/auth/request
//   2. Server generates random token, stores sha256(token) in magic_tokens,
//      emails the user `https://site/api/auth/verify?token=...&r=/where`
//   3. User clicks link → GET /api/auth/verify → consume token, create
//      session row, set HttpOnly cookie, redirect to `r`.
//
// No passwords. Tokens are 32 bytes (256 bits) — collision and brute-force
// attacks are not viable.

import type { D1Database } from "@cloudflare/workers-types";
import { sha256, ulid, now } from "../db";

const COOKIE_NAME = "tp_session";

function randomToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function createMagicToken(
  db: D1Database,
  email: string,
  redirectTo: string,
  ttlMinutes: number
): Promise<{ token: string }> {
  const token = randomToken();
  const hash = await sha256(token);
  const expiresAt = new Date(Date.now() + ttlMinutes * 60_000).toISOString();

  // Throttle: clean up old unconsumed tokens for this email (max 3 active)
  await db
    .prepare(
      `DELETE FROM magic_tokens
       WHERE email = ? AND consumed_at IS NULL
         AND token_hash NOT IN (
           SELECT token_hash FROM magic_tokens
           WHERE email = ? AND consumed_at IS NULL
           ORDER BY created_at DESC LIMIT 2
         )`
    )
    .bind(email.toLowerCase(), email.toLowerCase())
    .run();

  await db
    .prepare(
      `INSERT INTO magic_tokens (token_hash, email, redirect_to, expires_at)
       VALUES (?, ?, ?, ?)`
    )
    .bind(hash, email.toLowerCase(), redirectTo, expiresAt)
    .run();

  return { token };
}

export interface ConsumeResult {
  ok: boolean;
  userId?: string;
  redirectTo?: string;
  reason?: string;
}

export async function consumeMagicToken(
  db: D1Database,
  token: string,
  sessionTtlDays: number,
  meta: { ip?: string; userAgent?: string }
): Promise<ConsumeResult & { sessionId?: string }> {
  const hash = await sha256(token);

  const row = await db
    .prepare(
      `SELECT email, redirect_to, expires_at, consumed_at
       FROM magic_tokens WHERE token_hash = ?`
    )
    .bind(hash)
    .first<{ email: string; redirect_to: string; expires_at: string; consumed_at: string | null }>();

  if (!row) return { ok: false, reason: "not_found" };
  if (row.consumed_at) return { ok: false, reason: "already_used" };
  if (new Date(row.expires_at).getTime() < Date.now()) return { ok: false, reason: "expired" };

  // Find or create user
  let user = await db
    .prepare(`SELECT id FROM users WHERE email_lower = ?`)
    .bind(row.email)
    .first<{ id: string }>();

  if (!user) {
    const newId = ulid();
    await db
      .prepare(
        `INSERT INTO users (id, email, email_lower, verified_at, last_seen_at)
         VALUES (?, ?, ?, ?, ?)`
      )
      .bind(newId, row.email, row.email, now(), now())
      .run();
    user = { id: newId };
  } else {
    await db
      .prepare(`UPDATE users SET last_seen_at = ?, verified_at = COALESCE(verified_at, ?) WHERE id = ?`)
      .bind(now(), now(), user.id)
      .run();
  }

  // Mark token consumed
  await db
    .prepare(`UPDATE magic_tokens SET consumed_at = ? WHERE token_hash = ?`)
    .bind(now(), hash)
    .run();

  // Create session
  const sessionId = randomToken();
  const sessionExpires = new Date(Date.now() + sessionTtlDays * 86_400_000).toISOString();
  await db
    .prepare(
      `INSERT INTO sessions (id, user_id, expires_at, ip, user_agent)
       VALUES (?, ?, ?, ?, ?)`
    )
    .bind(sessionId, user.id, sessionExpires, meta.ip || null, (meta.userAgent || "").slice(0, 500))
    .run();

  return { ok: true, userId: user.id, redirectTo: row.redirect_to, sessionId };
}

export function sessionCookie(sessionId: string, ttlDays: number, secure = true): string {
  const maxAge = ttlDays * 86_400;
  const flags = ["Path=/", "HttpOnly", "SameSite=Lax", `Max-Age=${maxAge}`];
  if (secure) flags.push("Secure");
  return `${COOKIE_NAME}=${sessionId}; ${flags.join("; ")}`;
}

export function clearSessionCookie(): string {
  return `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}

export async function getSessionUser(
  db: D1Database,
  cookieHeader: string | null
): Promise<{ id: string; email: string; tier: string } | null> {
  if (!cookieHeader) return null;
  const match = cookieHeader.match(new RegExp(`${COOKIE_NAME}=([a-f0-9]+)`));
  if (!match) return null;
  const sessionId = match[1];

  const row = await db
    .prepare(
      `SELECT u.id, u.email, u.tier, s.expires_at, s.revoked_at
       FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE s.id = ?`
    )
    .bind(sessionId)
    .first<{ id: string; email: string; tier: string; expires_at: string; revoked_at: string | null }>();

  if (!row) return null;
  if (row.revoked_at) return null;
  if (new Date(row.expires_at).getTime() < Date.now()) return null;

  return { id: row.id, email: row.email, tier: row.tier };
}

export async function revokeSession(db: D1Database, cookieHeader: string | null): Promise<void> {
  if (!cookieHeader) return;
  const match = cookieHeader.match(new RegExp(`${COOKIE_NAME}=([a-f0-9]+)`));
  if (!match) return;
  await db
    .prepare(`UPDATE sessions SET revoked_at = ? WHERE id = ?`)
    .bind(now(), match[1])
    .run();
}
