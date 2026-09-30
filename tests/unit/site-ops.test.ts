import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { nogo } from '../../src/lib/nogo.ts';
import { plainExtract } from '../../src/lib/plain-extract.ts';
import { buildDigest, digestWhatsAppText } from '../../src/lib/digest-build.ts';
import { coverageSentence, healthStatus } from '../../src/lib/coverage.ts';
import { isEventName, sanitizeProps } from '../../src/lib/events.ts';

const notice = {
  title: 'Appointment of a building contractor for 201 houses',
  description: 'George Municipality invites bids to construct 201 subsidised houses in Thembalethu. CSD registration and the 80/20 preference point system apply.',
  closing_date: '2026-10-20',
  closing_time: '11:00',
  briefing_date: '2026-10-08',
  briefing_compulsory: 1,
  briefing_location: 'George Civic Centre',
  cidb_grade: '6GB',
  source_url: 'https://www.etenders.gov.za/Home/opportunities?id=1',
  documents_json: '[{"url":"https://www.etenders.gov.za/doc.pdf"}]',
};

describe('site wiring of batch 1 + 2', () => {
  it('detail page helpers agree: official + dates → ready, extract has close and 80/20', () => {
    const gates = nogo(notice, new Date('2026-09-30T10:00:00'));
    const extract = plainExtract(notice);
    assert.equal(gates.verdict, 'ready');
    assert.ok(gates.gates.find((g) => g.id === 'official')?.ok);
    assert.match(extract.close, /2026-10-20/);
    assert.match(extract.preference, /80\/20/);
    assert.ok(extract.must.some((m) => /briefing/i.test(m)));
  });

  it('digest cron can build a WhatsApp body from the same notice list', () => {
    const bundle = buildDigest([
      { id: '01JTESTNOTICE000000000001', title: notice.title, closing_date: notice.closing_date },
    ], { now: new Date('2026-09-30T10:00:00'), closeDays: 30, cap: 8 });
    assert.equal(bundle.closing.length, 1);
    const text = digestWhatsAppText(bundle);
    assert.match(text, /Closing soon/);
    assert.match(text, /tenders\/t\/01JTESTNOTICE000000000001/);
  });

  it('coverage board stays honest when ingest has written health', () => {
    const now = new Date('2026-09-30T10:00:00');
    const rows = [
      { source: 'etenders', last_ok_at: '2026-09-30T08:00:00Z' },
      { source: 'sanral', last_fail_at: '2026-09-30T09:00:00Z', last_error: 'timeout' },
    ];
    assert.equal(healthStatus(rows[0], now), 'ok');
    assert.equal(healthStatus(rows[1], now), 'fail');
    assert.match(coverageSentence(rows, now), /1 of 2 sources healthy/);
    assert.match(coverageSentence(rows, now), /1 failing/);
  });

  it('beacon + search events are allow-listed and strip PII', () => {
    assert.equal(isEventName('session_start'), true);
    assert.equal(isEventName('tender_view'), true);
    assert.equal(isEventName('search_run'), true);
    assert.equal(isEventName('win_score'), false);
    const clean = sanitizeProps({ email: 'a@b.c', q: 'construction', within: 7 });
    assert.equal('email' in clean, false);
    assert.equal(clean.q, 'construction');
  });
});
