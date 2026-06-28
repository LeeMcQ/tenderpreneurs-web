/** src/lib/verifier/engine.test.ts — run: npx tsx src/lib/verifier/engine.test.ts */
import assert from 'node:assert';
import { buildEnginePrompt } from './prompt.ts';
import { parseEngineResponse } from './parse.ts';

let passed = 0;
const test = (n: string, fn: () => void) => {
  try { fn(); passed++; console.log('  ✓ ' + n); }
  catch (e) { console.error('  ✗ ' + n + '\n    ' + (e as Error).message); process.exitCode = 1; }
};

console.log('prompt builder');
test('includes schema, codes, corpus, tender', () => {
  const p = buildEnginePrompt(
    { title: 'Build clinic', category: 'construction', closing_date: '2026-07-10' } as any,
    { rules: [{ id: 'x' }] },
  );
  assert.ok(p.system.includes('STRICT JSON'));
  assert.ok(p.user.includes('brand_specific_spec'));      // taxonomy present
  assert.ok(p.user.includes('CORPUS'));
  assert.ok(p.user.includes('Build clinic'));
  assert.ok(p.system.includes('NEVER invent'));
});

console.log('parser — happy path');
test('clean JSON parses', () => {
  const r = parseEngineResponse('{"flaws":[{"code":"brand_specific_spec","severity":"warning","message":"Brand named.","suggested_fix":"Add equivalent."}]}');
  assert.equal(r.length, 1);
  assert.equal(r[0].category, 'technical');               // forced from taxonomy
});
test('fenced JSON parses', () => {
  const r = parseEngineResponse('```json\n{"flaws":[{"code":"no_closing_date","severity":"critical","message":"No date."}]}\n```');
  assert.equal(r.length, 1);
  assert.equal(r[0].category, 'process');
});
test('prose then JSON parses', () => {
  const r = parseEngineResponse('Here is my analysis.\n{"flaws":[{"code":"specs_missing","severity":"warning","message":"No spec."}]}\nHope that helps!');
  assert.equal(r.length, 1);
});

console.log('parser — safety');
test('invented code dropped', () => {
  const r = parseEngineResponse('{"flaws":[{"code":"made_up_violation","severity":"critical","message":"Breaks fake law."}]}');
  assert.equal(r.length, 0);
});
test('model-chosen category ignored, taxonomy wins', () => {
  const r = parseEngineResponse('{"flaws":[{"code":"brand_specific_spec","category":"legal","severity":"warning","message":"x"}]}');
  assert.equal(r[0].category, 'technical');
});
test('bad severity defaults to warning', () => {
  const r = parseEngineResponse('{"flaws":[{"code":"specs_missing","severity":"apocalyptic","message":"x"}]}');
  assert.equal(r[0].severity, 'warning');
});
test('flaw with empty message dropped', () => {
  const r = parseEngineResponse('{"flaws":[{"code":"specs_missing","severity":"warning","message":""}]}');
  assert.equal(r.length, 0);
});
test('duplicate codes de-duped', () => {
  const r = parseEngineResponse('{"flaws":[{"code":"specs_missing","severity":"warning","message":"a"},{"code":"specs_missing","severity":"critical","message":"b"}]}');
  assert.equal(r.length, 1);
});
test('non-JSON → empty', () => {
  assert.equal(parseEngineResponse('I could not analyse this tender, sorry.').length, 0);
});
test('empty / garbage → empty', () => {
  assert.equal(parseEngineResponse('').length, 0);
  assert.equal(parseEngineResponse('{not json').length, 0);
});
test('bare array accepted', () => {
  const r = parseEngineResponse('[{"code":"under_specification","severity":"info","message":"vague"}]');
  assert.equal(r.length, 1);
});
test('long message capped', () => {
  const r = parseEngineResponse(JSON.stringify({ flaws: [{ code: 'specs_missing', severity: 'warning', message: 'x'.repeat(5000) }] }));
  assert.ok(r[0].message.length <= 600);
});

console.log(`\n${passed} checks passed.`);
