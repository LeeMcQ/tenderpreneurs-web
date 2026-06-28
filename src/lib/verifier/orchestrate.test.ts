/** src/lib/verifier/orchestrate.test.ts — run: npx tsx src/lib/verifier/orchestrate.test.ts */
import assert from 'node:assert';
import {
  reconcile, buildReport, toExternalReport,
  type ModelFlawSet, type DeterministicFlaw,
} from './orchestrate.ts';

let passed = 0;
const test = (n: string, fn: () => void) => {
  try { fn(); passed++; console.log('  ✓ ' + n); }
  catch (e) { console.error('  ✗ ' + n + '\n    ' + (e as Error).message); process.exitCode = 1; }
};
const find = (arr: any[], code: string) => arr.find(f => f.code === code);

const claude: ModelFlawSet = { engine: 'claude', flaws: [
  { category: 'technical', code: 'brand_specific_spec', severity: 'warning', message: 'Specification names a specific brand without "or equivalent".', suggested_fix: 'Add "or equivalent" and describe functional requirements.' },
  { category: 'legal', code: 'fake_section_42', severity: 'critical', message: 'Violates section 42 of the imaginary act.', suggested_fix: 'Cite correctly.' },
]};
const gemini: ModelFlawSet = { engine: 'gemini', flaws: [
  { category: 'technical', code: 'brand_specific_spec', severity: 'critical', message: 'Brand-specific; anti-competitive.', suggested_fix: 'Use functional specs.' },
]};
const chatgpt: ModelFlawSet = { engine: 'chatgpt', flaws: [
  { category: 'technical', code: 'brand_specific_spec', severity: 'warning', message: 'Brand named.', suggested_fix: 'Generic spec.' },
]};
const deterministic: DeterministicFlaw[] = [
  { code: 'preference_system_missing', category: 'process', severity: 'warning', message: 'No preference system stated.', suggested_fix: 'State 80/20 or 90/10.', rule_ref: 'PPR 2022' },
];

console.log('reconciliation');
test('3-model agreement → high confidence, max severity', () => {
  const r = reconcile([claude, gemini, chatgpt], deterministic);
  const b = find(r, 'brand_specific_spec');
  assert.equal(b.agreement, 3);
  assert.equal(b.confidence, 'high');
  assert.equal(b.severity, 'critical');        // escalated by gemini
  assert.equal(b.needs_human_check, false);
});
test('deterministic flag is verified + high', () => {
  const r = reconcile([claude, gemini, chatgpt], deterministic);
  const p = find(r, 'preference_system_missing');
  assert.equal(p.verified, true);
  assert.equal(p.confidence, 'high');
});
test('lone critical model claim → low confidence + flagged for human', () => {
  const r = reconcile([claude, gemini, chatgpt], deterministic);
  const fake = find(r, 'fake_section_42');
  assert.equal(fake.agreement, 1);
  assert.equal(fake.confidence, 'low');
  assert.equal(fake.needs_human_check, true); // hallucinated law never auto-sends
});
test('two-model agreement → medium', () => {
  const r = reconcile([claude, gemini], []);
  const b = find(r, 'brand_specific_spec');
  assert.equal(b.agreement, 2);
  assert.equal(b.confidence, 'medium');
});
test('picks most specific message', () => {
  const r = reconcile([claude, gemini, chatgpt], []);
  const b = find(r, 'brand_specific_spec');
  assert.ok(b.message.length >= 'Brand named.'.length);
});

console.log('report');
test('report groups by category + counts', () => {
  const r = reconcile([claude, gemini, chatgpt], deterministic);
  const rep = buildReport({ id: 't1', title: 'X' }, r, { framework_version: 'PPR-2022', disclaimer: 'Guidance only.', engines_used: ['claude','gemini','chatgpt'] });
  assert.ok(rep.sections.some(s => s.category === 'technical'));
  assert.ok(rep.sections.some(s => s.category === 'process'));
  assert.ok(rep.counts.needs_human_check >= 1);
  assert.ok(rep.health_score < 100);
});
test('external report withholds low-confidence claims', () => {
  const r = reconcile([claude, gemini, chatgpt], deterministic);
  const rep = buildReport({ id: 't1' }, r, { framework_version: 'PPR-2022', disclaimer: 'Guidance only.', engines_used: [] });
  const ext = toExternalReport(rep);
  const all = JSON.stringify(ext);
  assert.ok(!all.includes('fake_section_42') && !all.includes('imaginary'));  // hallucination not shared
  assert.ok(all.includes('engines') === false);                              // mechanics hidden
});

console.log(`\n${passed} checks passed.`);
