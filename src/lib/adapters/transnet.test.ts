/** src/lib/adapters/transnet.test.ts — run: npx tsx src/lib/adapters/transnet.test.ts */
import assert from 'node:assert';
import { mapTransnetRow, parseTransnetList, parseUsDate } from './transnet.ts';

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

console.log('transnet adapter');

test('parseUsDate reads advertised timestamps', () => {
  assert.equal(parseUsDate('2/22/2027 4:00:00 PM'), '2027-02-22');
  assert.equal(parseUsDate('9/15/2026 2:22:20 PM'), '2026-09-15');
});

test('mapTransnetRow reads live-shaped advertised row', () => {
  const t = mapTransnetRow({
    nameOfTender: 'TNPA/2026/03/0003/113693/RFP',
    descriptionOfTender: 'Appointment of a terminal operator at East London',
    tenderNumber: 'TNPA/2026/03/0003/113693/RFP',
    closingDate: '2/22/2027 4:00:00 PM',
    publishedDate: '9/15/2026 2:22:20 PM',
    contactPersonEmailAddress: 'Zamikhaya.Ngumbela@transnet.net',
    contactPersonName: 'Zamikhaya Ngumbela',
    locationOfService: 'Port Of East London',
    nameOfInstitution: 'TNPA',
    tenderCategory: 'Goods & Services',
    tenderStatus: 'Open',
    tenderType: 'RFP',
    rowKey: '113693',
    attachment: 'https://publishedetenders.blob.core.windows.net/publishedetenderscontainer/113693',
  });
  assert.ok(t);
  assert.equal(t!.sourceId, 'transnet');
  assert.equal(t!.externalId, '113693');
  assert.equal(t!.buyer, 'TNPA');
  assert.equal(t!.province, 'eastern-cape');
  assert.equal(t!.closingDate, '2027-02-22');
  assert.equal(t!.contactEmail, 'Zamikhaya.Ngumbela@transnet.net');
});

test('mapTransnetRow drops closed rows', () => {
  assert.equal(
    mapTransnetRow({
      tenderNumber: 'X',
      descriptionOfTender: 'gone',
      tenderStatus: 'Closed',
      rowKey: '1',
    }),
    null,
  );
});

test('parseTransnetList reads result wrapper', () => {
  const items = parseTransnetList({
    success: true,
    result: [{ tenderNumber: 'A', descriptionOfTender: 'Rail works', tenderStatus: 'Open', rowKey: '9' }],
  });
  assert.equal(items.length, 1);
  assert.equal(items[0].externalId, '9');
});

if (!process.exitCode) console.log(`${passed} passed`);
