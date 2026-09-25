/** npx tsx src/lib/verifier/advanced.test.ts */
import assert from 'node:assert';
import { scanTextFindings, mergeFindings, buildChecklist, readinessScore, findingsFromFlags } from './advanced.ts';
import { runRuleChecks, type Flag } from './rules.ts';

let passed = 0;
const test = (n: string, fn: () => void) => {
  try { fn(); passed++; console.log('  ✓ ' + n); }
  catch (e) { console.error('  ✗ ' + n + '\n    ' + (e as Error).message); process.exitCode = 1; }
};

console.log('advanced text scan');
test('brand without equivalent is flagged', () => {
  const f = scanTextFindings({ title: 'Supply of Caterpillar TLBs', description: 'Must be Caterpillar model 422F.' });
  assert.ok(f.some((x) => x.id === 'brand_specific_spec'));
  assert.ok(f.find((x) => x.id === 'brand_specific_spec')?.proposed.includes('or equivalent'));
});
test('PPA 2024 citation is critical', () => {
  const f = scanTextFindings({ title: 'Bid', description: 'Issued under the Public Procurement Act 28 of 2024.' });
  const hit = f.find((x) => x.id === 'ppa_2024_invalid');
  assert.ok(hit);
  assert.equal(hit?.severity, 'critical');
});
test('functionality without a mark is flagged', () => {
  const f = scanTextFindings({ title: 'Audit services', description: 'Bids will be scored on functionality then price.' });
  assert.ok(f.some((x) => x.id === 'functionality_threshold_unstated'));
});
test('RFQ on a large value is flagged', () => {
  const f = scanTextFindings({ title: 'RFQ for plant hire', description: 'Request for quotation.', estimated_value: 8_000_000_00 });
  assert.ok(f.some((x) => x.id === 'rfq_above_quotation_band'));
});
test('clean stationery notice stays quiet on brand and PPA', () => {
  const f = scanTextFindings({
    title: 'Supply of stationery',
    description: 'CSD registered suppliers. Submit SBD 1, SBD 4, SBD 6.1, tax PIN. Objections to SCM within 10 days.',
  });
  assert.ok(!f.some((x) => x.id === 'brand_specific_spec' || x.id === 'ppa_2024_invalid'));
});

console.log('merge + readiness');
test('rule flags convert and merge without duplicates', () => {
  const flags: Flag[] = runRuleChecks({
    title: 'Construction of clinic', category: 'construction',
    published_date: '2026-09-20', closing_date: '2026-09-26', closing_time: '11:00',
    briefing_compulsory: 1, briefing_date: '2026-09-10',
    cidb_grade: null, estimated_value: null, preference_system: null,
    contact_name: null, contact_email: null, contact_phone: null, documents_count: 0,
  }, '2026-09-25');
  const merged = mergeFindings(findingsFromFlags(flags), scanTextFindings({ title: 'Construction of clinic', category: 'construction', description: '' }));
  const ids = merged.map((m) => m.id);
  assert.equal(ids.length, new Set(ids).size);
});
test('checklist marks construction CIDB as required', () => {
  const items = buildChecklist({ title: 'Road reseal', category: 'construction', briefing_compulsory: 1 }, []);
  assert.ok(items.some((i) => i.code === 'CIDB' && i.required));
  assert.ok(items.some((i) => i.code === 'BRIEF' && i.required));
});
test('readiness drops on critical findings', () => {
  const s = readinessScore(
    [{ id: 'x', category: 'legal', severity: 'critical', title: 't', problem: 'p', why_it_matters: 'w', suggestion: 's', rule_ref: 'r', original: 'o', proposed: 'n', source: 'text' }],
    [],
  );
  assert.ok(s <= 82);
});

console.log(`\n${passed} checks passed.`);
