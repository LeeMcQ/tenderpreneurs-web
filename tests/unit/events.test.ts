import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { hashUser, isEventName, sanitizeProps } from '../../src/lib/events.ts';

describe('events', () => {
  it('accepts known names only', () => {
    assert.equal(isEventName('tender_view'), true);
    assert.equal(isEventName('session_start'), true);
    assert.equal(isEventName('win_score'), false);
    assert.equal(isEventName(''), false);
  });

  it('hashes a user id without keeping the raw value', () => {
    const h = hashUser('usr_abc');
    assert.ok(h);
    assert.equal(h.includes('usr_abc'), false);
    assert.equal(hashUser('usr_abc'), h);
    assert.equal(hashUser(null), null);
  });

  it('strips PII keys and long strings', () => {
    const out = sanitizeProps({
      email: 'lee@example.com',
      phone: '0820000000',
      q: 'construction western cape '.repeat(20),
      within: 7,
    });
    assert.equal('email' in out, false);
    assert.equal('phone' in out, false);
    assert.equal(out.within, 7);
    assert.equal(typeof out.q, 'string');
    assert.ok(String(out.q).length <= 120);
  });
});
