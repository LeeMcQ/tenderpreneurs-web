import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildDigest, digestWhatsAppText } from '../../src/lib/digest-build.ts';

const now = new Date('2026-09-30T10:00:00');

describe('buildDigest', () => {
  it('caps closing notices and skips closed ones', () => {
    const bundle = buildDigest([
      { id: 'A', title: 'Closed clinic', closing_date: '2026-09-01' },
      { id: 'B', title: 'Closes Friday', closing_date: '2026-10-03', procuring_entity: 'George' },
      { id: 'C', title: 'New stationery', first_seen_at: '2026-09-30T08:00:00Z' },
      { id: 'D', title: 'Far away', closing_date: '2026-12-01', first_seen_at: '2026-09-01' },
    ], { now, closeDays: 7, cap: 8 });
    assert.equal(bundle.closing.length, 1);
    assert.equal(bundle.closing[0].id, 'B');
    assert.equal(bundle.fresh.length, 1);
    assert.equal(bundle.fresh[0].id, 'C');
  });

  it('writes a short WhatsApp body', () => {
    const text = digestWhatsAppText({
      closing: [{ id: 'B', title: 'Closes Friday', closing_date: '2026-10-03' }],
      fresh: [{ id: 'C', title: 'New stationery' }],
    });
    assert.match(text, /Closing soon/);
    assert.match(text, /Closes Friday/);
    assert.match(text, /New today/);
    assert.match(text, /tenders\/t\/B/);
  });
});
