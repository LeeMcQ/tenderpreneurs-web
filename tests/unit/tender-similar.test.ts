import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { draftBidPack, lessonsFromClosed } from '../../src/lib/tender-similar.ts';

describe('lessonsFromClosed', () => {
  it('flags a short notice when peers published more scope', () => {
    const lessons = lessonsFromClosed(
      { description: 'Panel of agencies', sector: 'consulting', estimated_value: null, briefing_date: null, cidb_grade: null },
      [{ title: 'Travel panel 2024', description: 'x'.repeat(280), estimated_value: 80_000_000, briefing_date: '2024-03-01', cidb_grade: null, procuring_entity: 'Maluti-a-Phofung', closing_date: '2024-03-20', status: 'closed' }],
    );
    assert.ok(lessons.some((l) => /scope|description|short/i.test(l.message)));
    assert.ok(lessons.some((l) => /value|estimate|price/i.test(l.message)));
  });
});

describe('draftBidPack', () => {
  it('builds a starter pack from the live notice and closed peers', () => {
    const pack = draftBidPack(
      { title: 'Travel panel', description: 'Appointment of travelling agencies', sector: 'consulting', procuring_entity: 'Maluti-a-Phofung Local Municipality' },
      [{ title: 'Travel panel 2024', description: 'Twelve month panel', procuring_entity: 'Maluti-a-Phofung', status: 'closed' }],
    );
    assert.ok(pack.sections.length >= 4);
    assert.ok(pack.checklist.some((c) => c.code === 'CSD'));
    assert.match(pack.summary, /Maluti-a-Phofung/);
  });
});
