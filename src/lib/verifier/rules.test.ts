/** src/lib/verifier/rules.test.ts — run: npx tsx src/lib/verifier/rules.test.ts */
import assert from 'node:assert';
import { runRuleChecks, peerAnomaly, healthScore, type VerifyTender } from './rules.ts';

const TODAY = '2026-06-24';
let passed = 0;
const test = (n: string, fn: () => void) => {
  try { fn(); passed++; console.log('  ✓ ' + n); }
  catch (e) { console.error('  ✗ ' + n + '\n    ' + (e as Error).message); process.exitCode = 1; }
};
const has = (flags: any[], id: string) => flags.some(f => f.id === id);

const good: VerifyTender = {
  title: 'Supply of stationery', category: 'goods',
  published_date: '2026-06-01', closing_date: '2026-07-10', closing_time: '11:00',
  briefing_date: null, briefing_compulsory: 0, cidb_grade: null,
  estimated_value: 2_000_000_00, preference_system: '80/20',
  contact_name: 'SCM', contact_email: 'scm@dept.gov.za', contact_phone: null,
};

console.log('rule checks');
test('clean tender → no critical flags', () => {
  const f = runRuleChecks(good, TODAY);
  assert.ok(!f.some(x => x.severity === 'critical'));
});
test('missing closing date → critical', () => {
  const f = runRuleChecks({ ...good, closing_date: null }, TODAY);
  assert.ok(has(f, 'no_closing_date'));
});
test('closing before published → critical', () => {
  const f = runRuleChecks({ ...good, published_date: '2026-07-20' }, TODAY);
  assert.ok(has(f, 'closing_before_published'));
});
test('short window → warning', () => {
  const f = runRuleChecks({ ...good, published_date: '2026-07-05', closing_date: '2026-07-10' }, TODAY);
  assert.ok(has(f, 'short_advertising_window'));
});
test('missed compulsory briefing → critical', () => {
  const f = runRuleChecks({ ...good, briefing_compulsory: 1, briefing_date: '2026-06-10' }, TODAY);
  assert.ok(has(f, 'compulsory_briefing_passed'));
});
test('briefing after close → critical', () => {
  const f = runRuleChecks({ ...good, briefing_date: '2026-07-15' }, TODAY);
  assert.ok(has(f, 'briefing_after_close'));
});
test('construction without CIDB → warning', () => {
  const f = runRuleChecks({ ...good, title: 'Construction of clinic', category: 'construction', cidb_grade: null }, TODAY);
  assert.ok(has(f, 'construction_no_cidb'));
});
test('preference mismatch (R80m as 80/20) → warning', () => {
  const f = runRuleChecks({ ...good, estimated_value: 80_000_000_00, preference_system: '80/20' }, TODAY);
  assert.ok(has(f, 'preference_system_mismatch'));
});
test('no preference system stated → warning', () => {
  const f = runRuleChecks({ ...good, preference_system: null }, TODAY);
  assert.ok(has(f, 'preference_system_missing'));
});
test('no contact → warning', () => {
  const f = runRuleChecks({ ...good, contact_name: null, contact_email: null, contact_phone: null }, TODAY);
  assert.ok(has(f, 'no_contact_details'));
});

console.log('health score');
test('clean tender scores high', () => assert.ok(healthScore(runRuleChecks(good, TODAY)) >= 90));
test('broken tender scores low', () => {
  const f = runRuleChecks({ ...good, closing_date: null, briefing_compulsory: 1, briefing_date: '2026-06-10' }, TODAY);
  assert.ok(healthScore(f) < 60);
});

console.log('peer anomaly');
test('value far above peers flagged', () => {
  const peers = Array.from({ length: 6 }, () => ({ advertising_days: 21, estimated_value: 1_000_000_00 }));
  const { flags } = peerAnomaly({ advertising_days: 21, estimated_value: 100_000_000_00 }, peers);
  assert.ok(has(flags, 'peer_value_anomaly'));
});
test('short window vs peers flagged', () => {
  const peers = Array.from({ length: 6 }, () => ({ advertising_days: 30, estimated_value: 1_000_000_00 }));
  const { flags } = peerAnomaly({ advertising_days: 5, estimated_value: 1_000_000_00 }, peers);
  assert.ok(has(flags, 'peer_window_anomaly'));
});
test('too few peers → no anomaly claim', () => {
  const peers = [{ advertising_days: 21, estimated_value: 1_000_000_00 }];
  const { flags } = peerAnomaly({ advertising_days: 1, estimated_value: 999_000_000_00 }, peers);
  assert.equal(flags.length, 0);
});

console.log(`\n${passed} checks passed.`);
