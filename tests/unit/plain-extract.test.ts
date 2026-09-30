import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { plainExtract } from '../../src/lib/plain-extract.ts';

describe('plainExtract', () => {
  it('pulls buy, close, briefing, cidb and 80/20', () => {
    const r = plainExtract({
      title: 'Appointment of a building contractor',
      description: 'George Municipality invites bids to construct 201 subsidised houses in Thembalethu. Evaluation uses the 80/20 preference point system.',
      closing_date: '2026-10-20',
      closing_time: '11:00',
      briefing_date: '2026-10-08',
      briefing_compulsory: true,
      briefing_location: 'George Civic Centre',
      cidb_grade: '6GB',
    });
    assert.match(r.buy, /201 subsidised houses/i);
    assert.match(r.close, /2026-10-20/);
    assert.match(r.close, /11:00/);
    assert.match(r.briefing, /Compulsory/i);
    assert.match(r.cidb, /6GB/);
    assert.match(r.preference, /80\/20/);
    assert.ok(r.must.some((m) => /briefing/i.test(m)));
  });

  it('does not invent a preference system', () => {
    const r = plainExtract({
      title: 'Supply of stationery',
      description: 'Supply and delivery of office stationery to the department.',
    });
    assert.match(r.preference, /not recovered/i);
    assert.match(r.close, /No closing date/i);
  });
});
