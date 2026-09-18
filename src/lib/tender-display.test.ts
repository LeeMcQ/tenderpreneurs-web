/** src/lib/tender-display.test.ts — run: npx tsx src/lib/tender-display.test.ts */
import assert from 'node:assert';
import {
  looksLikeRef,
  displayTitle,
  fmtValue,
  urgency,
  daysToClose,
  GUEST_LIST_LIMIT,
} from './tender-display.ts';

let passed = 0;
const test = (n: string, fn: () => void) => {
  try { fn(); passed++; console.log('  \u2713 ' + n); }
  catch (e) { console.error('  \u2717 ' + n + '\n    ' + (e as Error).message); process.exitCode = 1; }
};

console.log('tender display');

test('bid-number titles look like refs', () => {
  assert.equal(looksLikeRef('TFR/2026/04/0006/114382/RFP', 'TFR/2026/04/0006/114382/RFP'), true);
  assert.equal(looksLikeRef('Supply of PPE to clinics', null), false);
});

test('displayTitle prefers a human title', () => {
  assert.equal(
    displayTitle({ title: 'Window frosting for municipal offices', source_ref: 'WC/12' }),
    'Window frosting for municipal offices'
  );
});

test('displayTitle falls back to first sentence of description', () => {
  assert.equal(
    displayTitle({
      title: 'TFR/2026/04/0006/114382/RFP',
      source_ref: 'TFR/2026/04/0006/114382/RFP',
      description: 'Appointment of a panel of transport consultants for a period of three years. More text.',
    }),
    'Appointment of a panel of transport consultants for a period of three years.'
  );
});

test('displayTitle uses Tender + ref when nothing else exists', () => {
  assert.equal(displayTitle({ title: 'TFR/1', source_ref: 'TFR/1', description: null }), 'TFR/1');
  assert.equal(displayTitle({ title: null, source_ref: 'ABC/99', description: null }), 'Tender ABC/99');
});

test('fmtValue uses R thousands and millions', () => {
  assert.equal(fmtValue(2_400_000_00), 'R2.4M');
  assert.equal(fmtValue(12_000_00), 'R12K');
  assert.equal(fmtValue(null), '');
});

test('urgency bands around a fixed Johannesburg day', () => {
  const now = new Date('2026-09-18T07:00:00+02:00');
  assert.equal(daysToClose('2026-09-18', now), 0);
  assert.equal(urgency('2026-09-18', '11:00', now).text, 'Closes today \u00b7 11:00');
  assert.equal(urgency('2026-09-18', '11:00', now).cls, 'u-red');
  assert.equal(urgency('2026-09-21', null, now).cls, 'u-red');
  assert.equal(urgency('2026-09-24', null, now).cls, 'u-amber');
  assert.equal(urgency('2026-10-18', null, now).cls, 'u-neutral');
  assert.match(urgency('2026-10-18', null, now).text, /Closes 18 Oct 2026/);
});

test('guest list limit is 20', () => {
  assert.equal(GUEST_LIST_LIMIT, 20);
});

console.log(passed + ' passed');
if (process.exitCode) process.exit(process.exitCode);
