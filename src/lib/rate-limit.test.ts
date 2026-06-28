/** src/lib/rate-limit.test.ts — run: npx tsx src/lib/rate-limit.test.ts */
import assert from 'node:assert';
import { rateLimit, clientKey } from './rate-limit.ts';

let passed = 0;
const test = async (n: string, fn: () => void | Promise<void>) => {
  try { await fn(); passed++; console.log('  ✓ ' + n); }
  catch (e) { console.error('  ✗ ' + n + '\n    ' + (e as Error).message); process.exitCode = 1; }
};

// Minimal in-memory KV mock (get/put with TTL ignored for the test).
function mockKV() {
  const m = new Map<string, string>();
  return { store: m, async get(k: string) { return m.get(k) ?? null; }, async put(k: string, v: string) { m.set(k, v); } };
}

(async () => {
  const T0 = 1_700_000_000_000; // fixed time

  console.log('rate-limit');
  await test('no KV binding → always allowed (no-op)', async () => {
    const r = await rateLimit({}, 'ip', 5, 60, T0);
    assert.equal(r.allowed, true);
  });

  await test('allows up to the limit then blocks', async () => {
    const env = { RATE_LIMIT_KV: mockKV() };
    let last;
    for (let i = 0; i < 5; i++) last = await rateLimit(env, 'ip1', 5, 60, T0);
    assert.equal(last!.allowed, true);
    const blocked = await rateLimit(env, 'ip1', 5, 60, T0);
    assert.equal(blocked.allowed, false);
    assert.ok(blocked.retryAfter > 0 && blocked.retryAfter <= 60);
  });

  await test('separate keys have separate buckets', async () => {
    const env = { RATE_LIMIT_KV: mockKV() };
    for (let i = 0; i < 5; i++) await rateLimit(env, 'a', 5, 60, T0);
    const other = await rateLimit(env, 'b', 5, 60, T0);
    assert.equal(other.allowed, true);
  });

  await test('window rolls over → allowed again', async () => {
    const env = { RATE_LIMIT_KV: mockKV() };
    for (let i = 0; i < 5; i++) await rateLimit(env, 'ip2', 5, 60, T0);
    const next = await rateLimit(env, 'ip2', 5, 60, T0 + 61_000); // next window
    assert.equal(next.allowed, true);
  });

  await test('KV read error → fails open (allowed)', async () => {
    const env = { RATE_LIMIT_KV: { async get() { throw new Error('kv down'); }, async put() {} } };
    const r = await rateLimit(env, 'ip3', 1, 60, T0);
    assert.equal(r.allowed, true);
  });

  await test('clientKey prefers CF-Connecting-IP', () => {
    const req = new Request('https://x', { headers: { 'CF-Connecting-IP': '1.2.3.4', 'x-forwarded-for': '9.9.9.9' } });
    assert.equal(clientKey(req), '1.2.3.4');
  });

  console.log(`\n${passed} checks passed.`);
})();
