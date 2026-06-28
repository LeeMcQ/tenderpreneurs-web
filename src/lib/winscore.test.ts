/**
 * src/lib/winscore.test.ts — run with:  npx tsx src/lib/winscore.test.ts
 */
import assert from 'node:assert';
import { computeWinScore, parseCidb, type TenderInput, type SupplierProfile } from './winscore.ts';

const TODAY = '2026-06-24';
let passed = 0;
function test(name: string, fn: () => void) {
  try { fn(); passed++; console.log('  ✓ ' + name); }
  catch (e) { console.error('  ✗ ' + name + '\n    ' + (e as Error).message); process.exitCode = 1; }
}

const baseProfile: SupplierProfile = {
  cidb_grade: '6CE',
  bbbee_level: 2,
  provinces: ['gauteng', 'western-cape'],
  sectors: ['construction', 'consulting'],
  capacity_value_max: 5_000_000_00, // R5m in cents
};
const baseTender: TenderInput = {
  sector: 'construction', province: 'gauteng', estimated_value: 2_000_000_00,
  cidb_grade: null, category: 'construction', closing_date: '2026-07-20', closing_time: null,
  briefing_date: null, briefing_compulsory: 0, bbbee_required: null, preference_system: '80/20',
};

console.log('parseCidb');
test('parses standard grade', () => assert.deepEqual(parseCidb('5CE'), { grade: 5, cls: 'CE' }));
test('parses grade with space', () => assert.deepEqual(parseCidb('7 GB'), { grade: 7, cls: 'GB' }));
test('rejects garbage', () => assert.equal(parseCidb('hello'), null));
test('rejects out-of-range grade', () => assert.equal(parseCidb('0CE'), null));
test('null-safe', () => assert.equal(parseCidb(null), null));
test('parses PE suffix (5CEPE)', () => assert.deepEqual(parseCidb('5CEPE'), { grade: 5, cls: 'CE' }));
test('parses spaced PE suffix (5 CE PE)', () => assert.deepEqual(parseCidb('5 CE PE'), { grade: 5, cls: 'CE' }));

console.log('hard gates');
test('CIDB grade too low → ineligible/blocking', () => {
  const r = computeWinScore({ ...baseTender, cidb_grade: '8CE' }, baseProfile, TODAY);
  assert.equal(r.blocking, true); assert.equal(r.band, 'ineligible');
  assert.ok(r.reasons.some(x => x.code === 'cidb_low'));
});
test('CIDB class mismatch → ineligible (6GB cannot bid 5CE)', () => {
  const r = computeWinScore({ ...baseTender, cidb_grade: '5CE' }, { ...baseProfile, cidb_grade: '6GB' }, TODAY);
  assert.equal(r.blocking, true);
  assert.ok(r.reasons.some(x => x.code === 'cidb_class'));
});
test('CIDB met → pass, not blocking', () => {
  const r = computeWinScore({ ...baseTender, cidb_grade: '5CE' }, baseProfile, TODAY);
  assert.equal(r.blocking, false);
  assert.ok(r.reasons.some(x => x.code === 'cidb_ok'));
});
test('missed compulsory briefing → ineligible', () => {
  const r = computeWinScore({ ...baseTender, briefing_compulsory: 1, briefing_date: '2026-06-01' }, baseProfile, TODAY);
  assert.equal(r.blocking, true);
  assert.ok(r.reasons.some(x => x.code === 'briefing_missed'));
});
test('closed tender → ineligible', () => {
  const r = computeWinScore({ ...baseTender, closing_date: '2026-06-01' }, baseProfile, TODAY);
  assert.equal(r.blocking, true);
});

console.log('fit scoring');
test('strong match scores high', () => {
  const r = computeWinScore(baseTender, baseProfile, TODAY);
  assert.equal(r.band, 'high'); assert.ok(r.score >= 70);
});
test('off-sector + off-province lowers score', () => {
  const r = computeWinScore({ ...baseTender, sector: 'health', province: 'limpopo' }, baseProfile, TODAY);
  assert.ok(r.score < 70);
  assert.ok(r.reasons.some(x => x.code === 'sector_off'));
  assert.ok(r.reasons.some(x => x.code === 'province_off'));
});
test('value well over capacity flagged', () => {
  const r = computeWinScore({ ...baseTender, estimated_value: 50_000_000_00 }, baseProfile, TODAY);
  assert.ok(r.reasons.some(x => x.code === 'value_over'));
});
test('national tender matches any province', () => {
  const r = computeWinScore({ ...baseTender, province: 'national' }, baseProfile, TODAY);
  assert.ok(r.reasons.some(x => x.code === 'province_match'));
});
test('null value handled gracefully', () => {
  const r = computeWinScore({ ...baseTender, estimated_value: null }, baseProfile, TODAY);
  assert.ok(r.reasons.some(x => x.code === 'value_unknown'));
  assert.ok(Number.isFinite(r.score));
});
test('closing very soon penalised', () => {
  const r = computeWinScore({ ...baseTender, closing_date: '2026-06-26' }, baseProfile, TODAY);
  assert.ok(r.reasons.some(x => x.code === 'closing_soon'));
});
test('score always within 0..100', () => {
  for (const v of [null, 0, 1, 999_999_999_00]) {
    const r = computeWinScore({ ...baseTender, estimated_value: v as any }, baseProfile, TODAY);
    assert.ok(r.score >= 0 && r.score <= 100);
  }
});

console.log('thin-data guard + closing time');
test('thin-data tender → low band + limited_data reason', () => {
  const r = computeWinScore(
    { sector: null, province: null, estimated_value: null, cidb_grade: null, category: null,
      closing_date: '2026-07-20', closing_time: null, briefing_date: null, briefing_compulsory: 0,
      bbbee_required: null, preference_system: null },
    { cidb_grade: null, bbbee_level: null, provinces: [], sectors: [], capacity_value_max: null }, TODAY);
  assert.equal(r.band, 'low');
  assert.ok(r.reasons.some(x => x.code === 'limited_data'));
});
test('closing today, time already passed → ineligible', () => {
  const r = computeWinScore({ ...baseTender, closing_date: TODAY, closing_time: '11:00' }, baseProfile, TODAY, '14:00');
  assert.equal(r.blocking, true);
  assert.equal(r.band, 'ineligible');
});
test('closing today, time still ahead → not closed', () => {
  const r = computeWinScore({ ...baseTender, closing_date: TODAY, closing_time: '16:00' }, baseProfile, TODAY, '09:00');
  assert.equal(r.blocking, false);
});

console.log(`\n${passed} checks passed.`);