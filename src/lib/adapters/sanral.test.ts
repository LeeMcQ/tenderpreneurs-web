/** src/lib/adapters/sanral.test.ts — run: npx tsx src/lib/adapters/sanral.test.ts */
import assert from 'node:assert';
import { mapSanralRow, parseSanralDate, parseSanralList, stripHtml } from './sanral.ts';

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

console.log('sanral adapter');

test('stripHtml drops tags and nbsp', () => {
  assert.equal(stripHtml('<a href="/x">R.1</a>&nbsp;'), 'R.1');
});

test('parseSanralDate accepts slash datetime', () => {
  assert.equal(parseSanralDate('2026/10/22 12:00'), '2026-10-22');
});

test('parseSanralDate rejects garbage', () => {
  assert.equal(parseSanralDate('TBA'), null);
});

test('mapSanralRow reads live-shaped DataTables cells', () => {
  const t = mapSanralRow([
    '<a href="/open-tenders/r-352-020-2025-1f">R.352-020-2025/1F</a>',
    'Consulting Services',
    'Eastern Cape',
    'Tender Notice:&nbsp; Routine road assessment.',
    'procurementsr6@sanral.co.za',
    '2026/10/22 12:00',
  ]);
  assert.ok(t);
  assert.equal(t!.sourceId, 'sanral');
  assert.equal(t!.externalId, 'r-352-020-2025-1f');
  assert.equal(t!.title, 'R.352-020-2025/1F');
  assert.equal(t!.buyer, 'SANRAL');
  assert.equal(t!.province, 'eastern-cape');
  assert.equal(t!.sector, 'consulting');
  assert.equal(t!.closingDate, '2026-10-22');
  assert.equal(t!.sourceUrl, 'https://www.nra.co.za/open-tenders/r-352-020-2025-1f');
  assert.equal(t!.contactEmail, 'procurementsr6@sanral.co.za');
});

test('mapSanralRow maps construction + national', () => {
  const t = mapSanralRow([
    '<a href="/open-tenders/n-002-200-2011-1">CONTRACT SANRAL N.002-200-2011/1</a>',
    'Construction Projects',
    'National',
    'Resurface',
    '',
    '2026-11-01',
  ]);
  assert.equal(t!.sector, 'construction');
  assert.equal(t!.province, 'national');
});

test('parseSanralList skips junk rows', () => {
  const items = parseSanralList({
    tenders: [
      ['<a href="/open-tenders/abc">ABC</a>', 'Consulting Services', 'Gauteng', 'd', '', '2026/09/30 11:00'],
      'not-an-array',
      [],
    ],
  });
  assert.equal(items.length, 1);
  assert.equal(items[0].externalId, 'abc');
});

test('empty payload → no tenders', () => {
  assert.deepEqual(parseSanralList({}), []);
});

if (!process.exitCode) console.log(`${passed} passed`);
