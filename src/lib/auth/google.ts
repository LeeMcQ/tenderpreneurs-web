// Google OAuth 2.0 (Authorization Code flow with PKCE-less server-secret exchange).
//
// Flow:
//   1. /api/auth/google/start  → generate state, store it, 302 to Google.
//   2. Google → /api/auth/google/callback?code=...&state=...
//   3. Verify state, exchange code for tokens, fetch userinfo,
//      upsert oauth_identities + users, create session cookie, redirect.
//
// We use the `openid email profile` scope only — no Calendar / Drive access.

import type { D1Database } from "@cloudflare/workers-types";
import { ulid, now } from "../db";

const STATE_TTL_MIN = 10;
const COOKIE_NAME = "tp_session";

function randomHex(bytes: number): string {
  const arr = crypto.getRandomValues(new Uint8Array(bytes));
  return Array.from(arr).map((b) => b.toString(16).padStart(2, "0")).join("");
}

// ----------------------------------------------------------------------
// State (CSRF protection)
// ----------------------------------------------------------------------

export async function createOAuthState(
  db: D1Database,
  provider: string,
  redirectTo: string,
  plan: string | null
): Promise<string> {
  const state = randomHex(32);
  const expiresAt = new Date(Date.now() + STATE_TTL_MIN * 60_000).toISOString();
  await db
    .prepare(
      `INSERT INTO oauth_state (state, provider, redirect_to, plan, expires_at)
       VALUES (?, ?, ?, ?, ?)`
    )
    .bind(state, provider, redirectTo, plan, expiresAt)
    .run();
  return state;
}

export async function consumeOAuthState(
  db: D1Database,
  state: string,
  provider: string
): Promise<{ ok: true; redirectTo: string; plan: string | null } | { ok: false }> {
  const row = await db
    .prepare(
      `SELECT redirect_to, plan, expires_at FROM oauth_state WHERE state = ? AND provider = ?`
    )
    .bind(state, provider)
    .first<{ redirect_to: string; plan: string | null; expires_at: string }>();

  // Single-use: delete regardless of validity
  await db.prepare(`DELETE FROM oauth_state WHERE state = ?`).bind(state).run();

  if (!row) return { ok: false };
  if (new Date(row.expires_at).getTime() < Date.now()) return { ok: false };
  return { ok: true, redirectTo: row.redirect_to || "/tenders", plan: row.plan };
}

// ----------------------------------------------------------------------
// Authorization URL
// ----------------------------------------------------------------------

export function buildGoogleAuthUrl(
  clientId: string,
  redirectUri: string,
  state: string
): string {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "openid email profile",
    state,
    access_type: "online",
    prompt: "select_account",
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

// ----------------------------------------------------------------------
// Token exchange + userinfo
// ----------------------------------------------------------------------

interface GoogleTokenResponse {
  access_token: string;
  expires_in: number;
  id_token?: string;
  token_type: string;
  scope: string;
}

interface GoogleUserInfo {
  sub: string;          // Google's stable user ID — what we store
  email: string;
  email_verified: boolean;
  name?: string;
  picture?: string;
}

export async function exchangeCodeForUser(
  code: string,
  clientId: string,
  clientSecret: string,
  redirectUri: string
): Promise<GoogleUserInfo> {
  // 1. Exchange the authorization code for an access token
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }).toString(),
  });
  if (!tokenRes.ok) {
    const txt = await tokenRes.text();
    throw new Error(`google_token_exchange_failed: ${txt}`);
  }
  const tokens = (await tokenRes.json()) as GoogleTokenResponse;

  // 2. Fetch userinfo
  const userRes = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
    headers: { authorization: `Bearer ${tokens.access_token}` },
  });
  if (!userRes.ok) throw new Error("google_userinfo_failed");
  const profile = (await userRes.json()) as GoogleUserInfo;
  if (!profile.email_verified) throw new Error("google_email_unverified");
  return profile;
}

// ----------------------------------------------------------------------
// Upsert user + identity, return session
// ----------------------------------------------------------------------

export async function upsertGoogleUser(
  db: D1Database,
  profile: GoogleUserInfo
): Promise<{ userId: string }> {
  const email = profile.email.toLowerCase();

  // 1. Already linked via this Google account?
  const existingIdentity = await db
    .prepare(
      `SELECT user_id FROM oauth_identities WHERE provider = 'google' AND provider_user_id = ?`
    )
    .bind(profile.sub)
    .first<{ user_id: string }>();

  if (existingIdentity) {
    await db
      .prepare(`UPDATE oauth_identities SET last_login_at = ? WHERE provider = 'google' AND provider_user_id = ?`)
      .bind(now(), profile.sub)
      .run();
    await db
      .prepare(`UPDATE users SET last_seen_at = ? WHERE id = ?`)
      .bind(now(), existingIdentity.user_id)
      .run();
    return { userId: existingIdentity.user_id };
  }

  // 2. User exists with this email but no Google identity yet? Link it.
  const existingUser = await db
    .prepare(`SELECT id FROM users WHERE email_lower = ?`)
    .bind(email)
    .first<{ id: string }>();

  let userId: string;
  if (existingUser) {
    userId = existingUser.id;
    await db
      .prepare(
        `UPDATE users
         SET name = COALESCE(name, ?),
             verified_at = COALESCE(verified_at, ?),
             last_seen_at = ?
         WHERE id = ?`
      )
      .bind(profile.name || null, now(), now(), userId)
      .run();
  } else {
    // 3. New user.
    userId = ulid();
    await db
      .prepare(
        `INSERT INTO users (id, email, email_lower, name, verified_at, last_seen_at)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .bind(userId, profile.email, email, profile.name || null, now(), now())
      .run();
  }

  // 4. Insert identity row
  await db
    .prepare(
      `INSERT INTO oauth_identities
         (id, user_id, provider, provider_user_id, email, display_name, picture_url, last_login_at)
       VALUES (?, ?, 'google', ?, ?, ?, ?, ?)`
    )
    .bind(
      ulid(),
      userId,
      profile.sub,
      profile.email,
      profile.name || null,
      profile.picture || null,
      now()
    )
    .run();

  return { userId };
}

// ----------------------------------------------------------------------
// Issue a session row + cookie (shares the same `sessions` table as magic-link)
// ----------------------------------------------------------------------

export async function issueSession(
  db: D1Database,
  userId: string,
  ttlDays: number,
  meta: { ip?: string; userAgent?: string }
): Promise<string> {
  const sessionId = randomHex(32);
  const expiresAt = new Date(Date.now() + ttlDays * 86_400_000).toISOString();
  await db
    .prepare(
      `INSERT INTO sessions (id, user_id, expires_at, ip, user_agent)
       VALUES (?, ?, ?, ?, ?)`
    )
    .bind(sessionId, userId, expiresAt, meta.ip || null, (meta.userAgent || "").slice(0, 500))
    .run();
  return sessionId;
}

export function sessionCookie(sessionId: string, ttlDays: number, secure = true): string {
  const maxAge = ttlDays * 86_400;
  const flags = ["Path=/", "HttpOnly", "SameSite=Lax", `Max-Age=${maxAge}`];
  if (secure) flags.push("Secure");
  return `${COOKIE_NAME}=${sessionId}; ${flags.join("; ")}`;
}
