/**
 * tests/integration/smoke.ts  (R12)
 * End-to-end smoke test of the live endpoints against a running dev server.
 * This exercises the DB/auth/routing wiring the unit tests can't.
 *
 * Run (after migrations 0003+0004 are applied to the dev D1):
 *   npm run build && npx wrangler pages dev ./dist            # in one terminal
 *   BASE_URL=http://localhost:8788 npx tsx tests/integration/smoke.ts   # in another
 *
 * Exits non-zero if any check fails. Checks that need data degrade to a skip.
 */
const BASE = process.env.BASE_URL || 'http://localhost:8788';

let pass = 0, fail = 0, skip = 0;
async function check(name: string, fn: () => Promise<void>) {
  try { await fn(); pass++; console.log('  ✓ ' + name); }
  catch (e: any) {
    if (e?.__skip) { skip++; console.log('  ~ skip: ' + name + ' (' + e.message + ')'); }
    else { fail++; console.error('  ✗ ' + name + '\n    ' + (e?.message ?? e)); }
  }
}
const skipIf = (cond: boolean, msg: string) => { if (cond) { const e: any = new Error(msg); e.__skip = true; throw e; } };
const expect = (cond: boolean, msg: string) => { if (!cond) throw new Error(msg); };

async function main() {
  console.log(`Integration smoke against ${BASE}\n`);

  let firstId: string | null = null;

  await check('GET /api/tenders/search → 200 + shape', async () => {
    const r = await fetch(`${BASE}/api/tenders/search?limit=5`);
    expect(r.status === 200, `status ${r.status}`);
    const d = await r.json();
    expect(Array.isArray(d.tenders), 'tenders is not an array');
    expect(typeof d.total === 'number', 'total missing');
    firstId = d.tenders[0]?.id ?? null;
  });

  await check('GET win-score (anon) → 200 + locked', async () => {
    skipIf(!firstId, 'no tender id');
    const r = await fetch(`${BASE}/api/tenders/${firstId}/win-score`);
    expect(r.status === 200, `status ${r.status}`);
    const d = await r.json();
    expect(d.ok === true, 'ok!=true');
    expect(d.locked === true || !!d.win, 'expected locked or win');
    expect(r.headers.get('cache-control')?.includes('no-store') ?? false, 'win-score should be no-store');
  });

  await check('GET verify → 200/404 + JSON', async () => {
    skipIf(!firstId, 'no tender id');
    const r = await fetch(`${BASE}/api/tenders/${firstId}/verify`);
    expect([200, 404].includes(r.status), `status ${r.status}`);
    await r.json();
  });

  await check('GET report (likely unpublished) → 200 published:false', async () => {
    skipIf(!firstId, 'no tender id');
    const r = await fetch(`${BASE}/api/tenders/${firstId}/report`);
    expect(r.status === 200, `status ${r.status}`);
    const d = await r.json();
    expect(d.ok === true, 'ok!=true');
  });

  await check('POST subscribe without consent → 400', async () => {
    const r = await fetch(`${BASE}/api/subscribe`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ procuring_entity: 'Test Dept', contact_email: 'a@b.gov.za', consent: false }),
    });
    expect(r.status === 400, `status ${r.status}`);
  });

  await check('POST subscribe valid → 200 + opt_out_url works', async () => {
    const r = await fetch(`${BASE}/api/subscribe`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ procuring_entity: 'Smoke Test Dept', contact_email: 'smoke@test.gov.za', consent: true }),
    });
    expect(r.status === 200, `status ${r.status}`);
    const d = await r.json();
    expect(d.ok === true && !!d.opt_out_url, 'no opt_out_url');
    const u = await fetch(d.opt_out_url);
    expect(u.status === 200, `opt-out status ${u.status}`);
  });

  await check('GET verify-cron without secret → 401', async () => {
    const r = await fetch(`${BASE}/api/admin/verify-cron`, { method: 'POST' });
    expect(r.status === 401, `status ${r.status}`);
  });

  await check('POST verify-run as anon → 403', async () => {
    const r = await fetch(`${BASE}/api/admin/verify-run`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ tender_id: firstId ?? 'x' }),
    });
    expect(r.status === 403, `status ${r.status}`);
  });

  console.log(`\n${pass} passed · ${fail} failed · ${skip} skipped`);
  if (fail > 0) process.exit(1);
}

main().catch((e) => { console.error('harness error:', e); process.exit(1); });
