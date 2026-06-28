/**
 * src/lib/rate-limit.ts
 * Fixed-window rate limiter for the cost-bearing AI endpoints (R9).
 * Uses a Cloudflare KV namespace bound as env.RATE_LIMIT_KV. If the binding is
 * absent, it degrades to a no-op (allow) so deploys without KV are unaffected.
 *
 * To enable: add to wrangler.toml
 *   [[kv_namespaces]]
 *   binding = "RATE_LIMIT_KV"
 *   id = "<your-namespace-id>"
 */
export interface RateResult { allowed: boolean; remaining: number; retryAfter: number; }

export function clientKey(request: Request): string {
  return (
    request.headers.get('CF-Connecting-IP') ||
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    'anon'
  );
}

export async function rateLimit(
  env: any, key: string, limit: number, windowSec: number, nowMs: number = Date.now(),
): Promise<RateResult> {
  const kv = env?.RATE_LIMIT_KV;
  if (!kv) return { allowed: true, remaining: limit, retryAfter: 0 }; // no infra → no-op

  const now = Math.floor(nowMs / 1000);
  const bucket = Math.floor(now / windowSec);
  const k = `rl:${key}:${bucket}`;

  let count = 0;
  try { const v = await kv.get(k); count = v ? (parseInt(v, 10) || 0) : 0; }
  catch { return { allowed: true, remaining: limit, retryAfter: 0 }; } // KV read error → fail open

  if (count >= limit) {
    return { allowed: false, remaining: 0, retryAfter: (bucket + 1) * windowSec - now };
  }
  try { await kv.put(k, String(count + 1), { expirationTtl: windowSec * 2 }); } catch { /* fail open */ }
  return { allowed: true, remaining: limit - count - 1, retryAfter: 0 };
}

/** Build a 429 Response from a blocked RateResult. */
export function tooMany(rl: RateResult): Response {
  return new Response(JSON.stringify({ ok: false, error: 'Too many requests. Please slow down.' }), {
    status: 429,
    headers: { 'content-type': 'application/json', 'retry-after': String(rl.retryAfter), 'cache-control': 'no-store' },
  });
}
