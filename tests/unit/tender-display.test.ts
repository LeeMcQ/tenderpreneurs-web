import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  looksLikeRef,
  displayTitle,
  fmtValue,
  urgency,
  daysToClose,
} from '../../src/lib/tender-display.ts';

describe('looksLikeRef', () => {
  it('treats TFR bid numbers as refs', () => {
    assert.equal(looksLikeRef('TFR/2026/04/0006/114382/RFP'), true);
  });
  it('treats title identical to source_ref as a ref', () => {
    assert.equal(looksLikeRef('004/2026/27', '004/2026/27'), true);
  });
  it('keeps a human title', () => {
    assert.equal(looksLikeRef('Supply and delivery of PPE to KZN Health'), false);
  });
});

describe('displayTitle', () => {
  it('prefers a human title', () => {
    assert.equal(
      displayTitle({ title: 'Window frosting for municipal buildings', source_ref: 'BID-1' }),
      'Window frosting for municipal buildings'
    );
  });
  it('falls back to the first sentence of the description', () => {
    assert.equal(
      displayTitle({
        title: 'TFR/2026/04/0006/114382/RFP',
        source_ref: 'TFR/2026/04/0006/114382/RFP',
        description: 'Appointment of a panel of transport consultants for a period of 36 months. Extra text.',
      }),
      'Appointment of a panel of transport consultants for a period of 36 months.'
    );
  });
  it('falls back to Tender {ref} when there is no description', () => {
    assert.equal(
      displayTitle({ title: '', source_ref: 'ES/26/INFRA/01' }),
      'Tender ES/26/INFRA/01'
    );
  });
});

describe('fmtValue', () => {
  it('formats millions and thousands in rand', () => {
    assert.equal(fmtValue(2_400_000_00), 'R2.4M');
    assert.equal(fmtValue(50_000_00), 'R50K');
  });
  it('hides empty or zero values', () => {
    assert.equal(fmtValue(null), '');
    assert.equal(fmtValue(0), '');
  });
});

describe('urgency', () => {
  const noon = new Date('2026-09-18T10:00:00+02:00');
  it('marks today with optional time', () => {
    assert.deepEqual(urgency('2026-09-18', '11:00', noon), {
      text: 'Closes today · 11:00',
      cls: 'u-red',
    });
  });
  it('uses calendar date when more than a week out', () => {
    const u = urgency('2026-10-02', null, noon);
    assert.equal(u.cls, 'u-neutral');
    assert.match(u.text, /Closes /);
  });
});

describe('daysToClose', () => {
  it('is zero on the closing calendar day in SAST', () => {
    assert.equal(daysToClose('2026-09-18', new Date('2026-09-18T22:00:00+02:00')), 0);
  });
});
