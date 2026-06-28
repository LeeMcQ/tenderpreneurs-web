/** src/lib/parts.test.ts — run: npx tsx src/lib/parts.test.ts */
import assert from 'node:assert';
import { matchesProfile, isEligible, type AlertProfile } from './alerts/match.ts';
import { provinceSlug, sectorSlug, bbbeeToLevel, normaliseProfileInput } from './profile.ts';

let passed = 0;
const test = (n: string, fn: () => void) => {
  try { fn(); passed++; console.log('  ✓ ' + n); }
  catch (e) { console.error('  ✗ ' + n + '\n    ' + (e as Error).message); process.exitCode = 1; }
};

const profile: AlertProfile = {
  provinces: ['gauteng', 'western-cape'],
  sectors: ['construction'],
  keywords: ['borehole', 'fencing'],
  cidb_grades: ['6CE', '4GB'],
};

console.log('alert matching');
test('sector + province match → alert', () => {
  const r = matchesProfile({ id: '1', title: 'Build clinic', sector: 'construction', province: 'gauteng', cidb_grade: null }, profile);
  assert.equal(r.match, true);
});
test('keyword match outside sector → alert', () => {
  const r = matchesProfile({ id: '2', title: 'Drilling of a borehole', sector: 'agriculture', province: 'gauteng', cidb_grade: null }, profile);
  assert.equal(r.match, true);
});
test('province out of scope → no alert', () => {
  const r = matchesProfile({ id: '3', title: 'Build clinic', sector: 'construction', province: 'limpopo', cidb_grade: null }, profile);
  assert.equal(r.match, false);
});
test('national tender in scope', () => {
  const r = matchesProfile({ id: '4', title: 'Build clinic', sector: 'construction', province: 'national', cidb_grade: null }, profile);
  assert.equal(r.match, true);
});
test('relevant but ineligible (CIDB too high) → no alert', () => {
  const r = matchesProfile({ id: '5', title: 'Build clinic', sector: 'construction', province: 'gauteng', cidb_grade: '8CE' }, profile);
  assert.equal(r.eligible, false);
  assert.equal(r.match, false);
});
test('eligible via second held grade/class', () => {
  assert.equal(isEligible({ id: '6', title: 'x', sector: 'construction', province: 'gauteng', cidb_grade: '3GB' }, profile), true);
});

console.log('profile normalisation (R7)');
test('province label → slug', () => assert.equal(provinceSlug('Eastern Cape'), 'eastern-cape'));
test('province KZN → slug', () => assert.equal(provinceSlug('KwaZulu-Natal'), 'kwazulu-natal'));
test('sector ICT → ict', () => assert.equal(sectorSlug('ICT'), 'ict'));
test('unknown label → null', () => assert.equal(sectorSlug('Underwater Basket Weaving'), null));
test('bbbee label → level', () => assert.equal(bbbeeToLevel('Level 2 Contributor'), 2));
test('EME → conservative 4', () => assert.equal(bbbeeToLevel('Exempt Micro Enterprise (EME)'), 4));
test('prefer-not-to-say → null', () => assert.equal(bbbeeToLevel('Prefer not to say'), null));
test('full normalise produces slugs + cents', () => {
  const n = normaliseProfileInput({
    cidb_grades: ['6ce', ' 4gb '], bbbeeLevel: 'Level 1 Contributor',
    provinces: ['Gauteng', 'Western Cape', 'Atlantis'], sectors: ['Construction', 'ICT'],
    keywords: ['Borehole', 'borehole', 'FENCING'], capacityValueMaxRand: 5_000_000, jvVisible: true,
  });
  assert.deepEqual(JSON.parse(n.cidb_grades_json), ['6CE', '4GB']);
  assert.equal(n.bbbee_level, 1);
  assert.deepEqual(JSON.parse(n.provinces_json), ['gauteng', 'western-cape']); // 'Atlantis' dropped
  assert.deepEqual(JSON.parse(n.sectors_json), ['construction', 'ict']);
  assert.deepEqual(JSON.parse(n.keywords_json), ['borehole', 'fencing']);       // de-duped, lowercased
  assert.equal(n.capacity_value_max, 5_000_000_00);
  assert.equal(n.jv_visible, 1);
});

console.log(`\n${passed} checks passed.`);
