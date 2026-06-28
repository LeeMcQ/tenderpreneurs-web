/** src/lib/verifier/pipeline.test.ts — run: npx tsx src/lib/verifier/pipeline.test.ts */
import assert from 'node:assert';
import { generateReport } from './generate.ts';
import { nextStatus } from './workflow.ts';

let passed = 0;
const test = (n: string, fn: () => void) => {
  try { fn(); passed++; console.log('  ✓ ' + n); }
  catch (e) { console.error('  ✗ ' + n + '\n    ' + (e as Error).message); process.exitCode = 1; }
};

const TODAY = '2026-06-24';

console.log('report pipeline');
test('clean tender (no engines) → high health, no critical', () => {
  const rep = generateReport({
    tender: {
      id: 't1', source_ref: 'RFQ-1', title: 'Stationery', procuring_entity: 'Dept X',
      category: 'goods', published_date: '2026-06-01', closing_date: '2026-07-10', closing_time: '11:00',
      briefing_date: null, briefing_compulsory: 0, cidb_grade: null, estimated_value: 2_000_000_00,
      preference_system: '80/20', contact_email: 'scm@x.gov.za', documents_count: 2,
    },
    subjectWindowDays: 39, peers: [], todayISO: TODAY,
  });
  assert.ok(rep.health_score >= 90);
  assert.equal(rep.counts.critical, 0);
});

test('broken tender → flaws routed into sections', () => {
  const rep = generateReport({
    tender: {
      id: 't2', source_ref: 'C-9', title: 'Construction of clinic', procuring_entity: 'Muni',
      category: 'construction', published_date: '2026-06-20', closing_date: '2026-06-26', closing_time: null,
      briefing_date: '2026-06-10', briefing_compulsory: 1, cidb_grade: null, estimated_value: null,
      preference_system: null, contact_name: null, contact_email: null, contact_phone: null, documents_count: 0,
    },
    subjectWindowDays: 6, peers: [], history: [{ change_type: 'extended' }], todayISO: TODAY,
  });
  assert.ok(rep.health_score < 60);
  assert.ok(rep.counts.critical >= 1);                       // missed compulsory briefing
  const cats = rep.sections.map(s => s.category);
  assert.ok(cats.includes('process'));
  assert.ok(cats.includes('technical'));                     // construction_no_cidb + specs_missing
  // extension flag present
  const all = JSON.stringify(rep);
  assert.ok(all.includes('extended or amended'));
});

test('model outputs raise confidence + appear in report', () => {
  const rep = generateReport({
    tender: { id: 't3', title: 'X', category: 'goods', closing_date: '2026-07-10', closing_time: '11:00',
      estimated_value: 1_000_000_00, preference_system: '80/20', contact_email: 'a@b.gov.za', documents_count: 1 },
    subjectWindowDays: 30, peers: [], todayISO: TODAY,
    modelOutputs: [
      { engine: 'claude', flaws: [{ category: 'technical', code: 'brand_specific_spec', severity: 'warning', message: 'Brand named without equivalent.', suggested_fix: 'Add or equivalent.' }] },
      { engine: 'gemini', flaws: [{ category: 'technical', code: 'brand_specific_spec', severity: 'warning', message: 'Brand-specific.', suggested_fix: 'Functional spec.' }] },
      { engine: 'chatgpt', flaws: [{ category: 'technical', code: 'brand_specific_spec', severity: 'warning', message: 'Names a brand.', suggested_fix: 'Generic.' }] },
    ],
    enginesUsed: ['claude', 'gemini', 'chatgpt'],
  });
  const tech = rep.sections.find(s => s.category === 'technical');
  const brand = tech?.flaws.find(f => f.code === 'brand_specific_spec');
  assert.ok(brand);
  assert.equal(brand!.confidence, 'high');   // 3 engines agree
  assert.equal(brand!.agreement, 3);
});

console.log('workflow');
test('draft → approve → approved', () => assert.equal(nextStatus('draft', 'approve').status, 'approved'));
test('approved → publish → published', () => assert.equal(nextStatus('approved', 'publish').status, 'published'));
test('published → send flags consent gate', () => {
  const r = nextStatus('published', 'send');
  assert.equal(r.status, 'sent');
  assert.equal(r.requires_consent_gate, true);
});
test('cannot publish a draft directly', () => assert.equal(nextStatus('draft', 'publish').ok, false));
test('cannot send before publish', () => assert.equal(nextStatus('approved', 'send').ok, false));
test('discard from draft', () => assert.equal(nextStatus('draft', 'discard').status, 'discarded'));
test('reopen published → draft', () => assert.equal(nextStatus('published', 'reopen').status, 'draft'));
test('sent is terminal', () => assert.equal(nextStatus('sent', 'reopen').ok, false));

console.log(`\n${passed} checks passed.`);
