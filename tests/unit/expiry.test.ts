import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseExpiry, expiryHeadline, expiryFromForm } from '../../src/lib/expiry.ts';

const now = new Date('2026-09-30T10:00:00');

describe('parseExpiry', () => {
  it('classifies expired, soon, and ok dates', () => {
    const items = parseExpiry(JSON.stringify({
      tax_pin: '2026-08-01',
      csd: '2026-10-15',
      bbbee: '2027-01-01',
    }), now);
    const byKey = Object.fromEntries(items.map((i) => [i.key, i]));
    assert.equal(byKey.tax_pin.state, 'expired');
    assert.match(byKey.tax_pin.label, /tax pin/i);
    assert.equal(byKey.csd.state, 'soon');
    assert.equal(byKey.bbbee.state, 'ok');
  });

  it('headlines expired first', () => {
    const items = parseExpiry(JSON.stringify({
      tax_pin: '2026-08-01',
      csd: '2026-10-15',
    }), now);
    assert.match(expiryHeadline(items), /expired/i);
  });

  it('handles empty json', () => {
    assert.deepEqual(parseExpiry(null), []);
    assert.match(expiryHeadline([]), /No document dates/i);
  });
});

describe('expiryFromForm', () => {
  it('keeps only dated known keys', () => {
    const json = expiryFromForm({
      tax_pin: '2026-12-01',
      csd: 'not-a-date',
      email: 'a@b.c',
      bank: '2027-01-15',
    });
    const obj = JSON.parse(json);
    assert.equal(obj.tax_pin, '2026-12-01');
    assert.equal(obj.bank, '2027-01-15');
    assert.equal('csd' in obj, false);
    assert.equal('email' in obj, false);
  });
});
