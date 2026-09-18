/** src/lib/adapters/cct.test.ts — run: npx tsx src/lib/adapters/cct.test.ts */
import assert from 'node:assert';
import { parseCctHtml, parseCctRow, parseIsoDate } from './cct.ts';

let passed = 0;
const test = (n: string, fn: () => void) => {
  try {
    fn();
    passed++;
    console.log('  ✓ ' + n);
  } catch (e) {
    console.error('  ✗ ' + n + '\n    ' + (e as Error).message);
    process.exitCode = 1;
  }
};

console.log('cct adapter');

test('parseIsoDate', () => {
  assert.equal(parseIsoDate('2026-10-02 10:00 AM'), '2026-10-02');
});

test('parseCctRow reads live-shaped cells', () => {
  const t = parseCctRow([
    '050G/2026/27',
    'The supply and delivery of electricity meters',
    'ENERGY',
    'Electricity Generation and Distribution',
    '2026-09-28',
    '2026-09-28 10:00 AM',
    '2026-08-27',
    '2026-08-27 13:40 PM',
    '',
    '',
    '',
  ]);
  assert.ok(t);
  assert.equal(t!.sourceId, 'cct');
  assert.equal(t!.externalId, '050G/2026/27');
  assert.equal(t!.buyer, 'City of Cape Town');
  assert.equal(t!.province, 'western-cape');
  assert.equal(t!.sector, 'energy');
  assert.equal(t!.closingDate, '2026-09-28');
});

test('parseCctHtml reads gridDetails rows', () => {
  const html = `
    <tr class="gridDetails"><td>57S/2026/27</td><td>Fine services</td><td>SAFETY AND SECURITY</td><td>Public Safety</td><td>2026-10-02</td><td></td><td>2026-08-28</td></tr>
    <tr class="other"><td>skip</td></tr>
  `;
  const items = parseCctHtml(html);
  assert.equal(items.length, 1);
  assert.equal(items[0].sector, 'security');
});

if (!process.exitCode) console.log(`${passed} passed`);
