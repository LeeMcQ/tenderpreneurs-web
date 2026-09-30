import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { nogo } from '../../src/lib/nogo.ts';

const now = new Date('2026-09-30T10:00:00');

describe('nogo', () => {
  it('marks closed notices as no-go', () => {
    const r = nogo({
      closing_date: '2026-09-01',
      source_url: 'https://www.etenders.gov.za/x',
      description: 'Appointment of a contractor to build a clinic in Thembalethu.',
      documents_json: '[{"url":"https://x"}]',
    }, now);
    assert.equal(r.verdict, 'no-go');
    assert.equal(r.gates.find((g) => g.id === 'closing')?.ok, false);
  });

  it('fails compulsory briefing that already passed', () => {
    const r = nogo({
      closing_date: '2026-10-20',
      briefing_date: '2026-09-01',
      briefing_compulsory: 1,
      source_url: 'https://www.etenders.gov.za/x',
      description: 'Appointment of a contractor to build a clinic in Thembalethu.',
      documents_json: '[{"url":"https://x"}]',
    }, now);
    assert.equal(r.verdict, 'no-go');
    assert.equal(r.gates.find((g) => g.id === 'briefing')?.ok, false);
  });

  it('is ready when dates, official link, and scope exist', () => {
    const r = nogo({
      closing_date: '2026-10-20',
      source_url: 'https://www.etenders.gov.za/x',
      description: 'Appointment of a contractor to build a clinic in Thembalethu.',
      documents_json: '[{"url":"https://x"}]',
    }, now);
    assert.equal(r.verdict, 'ready');
    assert.ok(r.gates.every((g) => g.ok));
  });

  it('flags missing official URL as risk, not a hard no-go', () => {
    const r = nogo({
      closing_date: '2026-10-20',
      description: 'Appointment of a contractor to build a clinic in Thembalethu.',
      documents_json: '[{"url":"https://x"}]',
    }, now);
    assert.equal(r.verdict, 'risk');
    assert.equal(r.gates.find((g) => g.id === 'official')?.ok, false);
    assert.equal(r.gates.find((g) => g.id === 'closing')?.ok, true);
  });
});
