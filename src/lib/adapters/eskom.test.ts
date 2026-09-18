/** src/lib/adapters/eskom.test.ts — run: npx tsx src/lib/adapters/eskom.test.ts */
import assert from 'node:assert';
import { mapEskomRow, parseEskomList, parseIsoDate } from './eskom.ts';

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

console.log('eskom adapter');

test('parseIsoDate reads timestamp', () => {
  assert.equal(parseIsoDate('2026-09-14T10:00:00'), '2026-09-14');
});

test('mapEskomRow reads live-shaped bulletin row', () => {
  const t = mapEskomRow({
    TENDER_ID: 95242,
    REFERENCE: 'E2992GCDMWPGC',
    HEADER_DESC: 'Provision of IT professional services',
    SCOPE_DETAILS: 'Information security and governance.',
    DESCRIPTION: 'GENERATION',
    Province: 'Gauteng',
    EMAIL: 'mohlabkp@eskom.co.za',
    CLOSING_DATE: '2026-09-25T10:00:00',
    PUBLISHEDDATE: '2026-09-01T11:16:59',
  });
  assert.ok(t);
  assert.equal(t!.sourceId, 'eskom');
  assert.equal(t!.externalId, '95242');
  assert.equal(t!.buyer, 'Eskom');
  assert.equal(t!.province, 'gauteng');
  assert.equal(t!.sector, 'ict');
  assert.equal(t!.closingDate, '2026-09-25');
  assert.equal(t!.contactEmail, 'mohlabkp@eskom.co.za');
  assert.equal(t!.sourceUrl, 'https://tenderbulletin.eskom.co.za/tender/95242');
});

test('mapEskomRow drops cancellations', () => {
  assert.equal(
    mapEskomRow({
      TENDER_ID: 1,
      HEADER_DESC: 'TENDER CANCELLATION: line works',
      REFERENCE: 'X',
    }),
    null,
  );
});

test('parseEskomList skips junk and caps', () => {
  const items = parseEskomList([
    { TENDER_ID: 2, HEADER_DESC: 'Keep me', REFERENCE: 'A1', Province: 'National' },
    'nope',
    { HEADER_DESC: 'missing id' },
  ]);
  assert.equal(items.length, 1);
  assert.equal(items[0].externalId, '2');
});

if (!process.exitCode) console.log(`${passed} passed`);
