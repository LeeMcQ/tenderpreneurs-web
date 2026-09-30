import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { coverageSentence, healthStatus, sourceLabel } from '../../src/lib/coverage.ts';

const now = new Date('2026-09-30T10:00:00');

describe('coverage', () => {
  it('labels known sources', () => {
    assert.equal(sourceLabel('etenders'), 'National Treasury eTenders');
    assert.equal(sourceLabel('mystery'), 'mystery');
  });

  it('marks recent ok as ok and old as stale', () => {
    assert.equal(healthStatus({ source: 'etenders', last_ok_at: '2026-09-30T08:00:00Z' }, now), 'ok');
    assert.equal(healthStatus({ source: 'sanral', last_ok_at: '2026-09-20T08:00:00Z' }, now), 'stale');
    assert.equal(healthStatus({
      source: 'eskom',
      last_ok_at: '2026-09-29T08:00:00Z',
      last_fail_at: '2026-09-30T09:00:00Z',
      last_error: 'timeout',
    }, now), 'fail');
    assert.equal(healthStatus(null, now), 'unknown');
  });

  it('summarises a board', () => {
    const line = coverageSentence([
      { source: 'etenders', last_ok_at: '2026-09-30T08:00:00Z' },
      { source: 'sanral', last_ok_at: '2026-09-20T08:00:00Z' },
    ], now);
    assert.match(line, /1 of 2 sources healthy/);
  });
});
