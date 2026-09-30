import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { FEATURES } from '../../src/config/site.ts';
import { expiryFromForm } from '../../src/lib/expiry.ts';
import { isEventName } from '../../src/lib/events.ts';

function src(path: string) {
  return readFileSync(new URL('../../' + path, import.meta.url), 'utf8');
}

describe('batch 3 + 4 site wiring', () => {
  it('marks shipped product surfaces live/beta, not coming-soon', () => {
    assert.equal(FEATURES.briefingCalendar.status, 'live');
    assert.equal(FEATURES.coverageBoard.status, 'live');
    assert.equal(FEATURES.goNoGo.status, 'live');
    assert.equal(FEATURES.plainExtract.status, 'live');
    assert.equal(FEATURES.emailAlerts.status, 'beta');
    assert.equal(FEATURES.liveTenderFeed.status, 'live');
  });

  it('account form posts document dates', () => {
    const page = src('src/pages/account.astro');
    assert.match(page, /doc_expiry/);
    assert.match(page, /exp_tax_pin/);
    const saved = expiryFromForm({ tax_pin: '2026-11-02' });
    assert.equal(JSON.parse(saved).tax_pin, '2026-11-02');
  });

  it('detail page flags thin notices and keeps official click hook', () => {
    const page = src('src/pages/tenders/t/[id].astro');
    assert.match(page, /flagThinNotice/);
    assert.match(page, /data-evt="official_link_out"/);
    assert.match(page, /nogo\(/);
    assert.match(page, /plainExtract\(/);
    assert.equal(page.includes('resolveWinScore'), false);
  });

  it('browse + home no longer sell a win percentage', () => {
    const browse = src('src/pages/tenders/index.astro');
    const home = src('src/pages/index.astro');
    assert.equal(/win-probability|win probability score/i.test(browse), false);
    assert.match(browse, /\/coverage/);
    assert.match(browse, /\/briefings/);
    assert.equal(/win-probability scoring/i.test(home), false);
    assert.match(home, /Go \/ no-go/);
  });

  it('alerts save a digest search and can delete it', () => {
    const page = src('src/pages/alerts.astro');
    assert.match(page, /\/api\/searches/);
    assert.match(page, /data-del-search/);
    assert.match(page, /saved_searches/);
  });

  it('beacon allow-list still rejects retired score events', () => {
    assert.equal(isEventName('official_link_out'), true);
    assert.equal(isEventName('session_start'), true);
    assert.equal(isEventName('win_score'), false);
  });

  it('sitemap lists briefings and coverage', () => {
    const map = src('src/pages/sitemap.xml.ts');
    assert.match(map, /\/briefings/);
    assert.match(map, /\/coverage/);
  });
});
