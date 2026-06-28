// src/lib/admin.ts — minimal admin gate via env.ADMIN_EMAILS (comma-separated).
// Add ADMIN_EMAILS to wrangler.toml [vars] / Pages env. Replace with a users.is_admin
// column if you prefer DB-driven roles.
export function isAdminEmail(email: string | null | undefined, env: any): boolean {
  const list = String(env?.ADMIN_EMAILS ?? '')
    .toLowerCase().split(',').map((s: string) => s.trim()).filter(Boolean);
  return !!email && list.includes(email.toLowerCase());
}
