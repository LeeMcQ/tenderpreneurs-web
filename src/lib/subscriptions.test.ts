/** src/lib/subscriptions.test.ts — run: npx tsx src/lib/subscriptions.test.ts */
import assert from 'node:assert';
import { normaliseEmail, makeOptOutToken, verifyOptOutToken } from './subscriptions.ts';

let passed = 0;
const test = async (n: string, fn: () => void | Promise<void>) => {
  try { await fn(); passed++; console.log('  ✓ ' + n); }
  catch (e) { console.error('  ✗ ' + n + '\n    ' + (e as Error).message); process.exitCode = 1; }
};

(async () => {
  console.log('email');
  await test('valid email normalised', () => assert.equal(normaliseEmail('  SCM@Dept.GOV.za '), 'scm@dept.gov.za'));
  await test('invalid email → null', () => assert.equal(normaliseEmail('not-an-email'), null));
  await test('empty → null', () => assert.equal(normaliseEmail(''), null));

  console.log('opt-out token');
  const secret = 'unsub-secret-123';
  await test('round-trips entity + email', async () => {
    const t = await makeOptOutToken('Dept of Works', 'scm@dept.gov.za', secret);
    const v = await verifyOptOutToken(t, secret);
    assert.deepEqual(v, { entity: 'Dept of Works', email: 'scm@dept.gov.za' });
  });
  await test('wrong secret → null', async () => {
    const t = await makeOptOutToken('Dept', 'a@b.gov.za', secret);
    assert.equal(await verifyOptOutToken(t, 'other-secret'), null);
  });
  await test('tampered token → null', async () => {
    const t = await makeOptOutToken('Dept', 'a@b.gov.za', secret);
    assert.equal(await verifyOptOutToken(t.slice(0, -2) + 'xy', secret), null);
  });
  await test('garbage token → null', async () => {
    assert.equal(await verifyOptOutToken('garbage', secret), null);
    assert.equal(await verifyOptOutToken('', secret), null);
  });
  await test('entity with pipe-like name still parses (first pipe splits)', async () => {
    const t = await makeOptOutToken('City of CT', 'tenders@cct.gov.za', secret);
    const v = await verifyOptOutToken(t, secret);
    assert.equal(v?.email, 'tenders@cct.gov.za');
  });

  console.log(`\n${passed} checks passed.`);
})();
