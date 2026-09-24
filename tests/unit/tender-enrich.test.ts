import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  bbbeeFromText,
  bbbeeLevelNumber,
  cidbFromText,
  clockFromIso,
  officialFetchUrl,
  patchFromRelease,
  returnablesFromText,
} from '../../src/lib/tender-enrich.ts';

describe('clockFromIso', () => {
  it('keeps the published close time', () => {
    assert.equal(clockFromIso('2026-10-02T11:00:00+02:00'), '11:00');
    assert.equal(clockFromIso('2026-10-02'), null);
  });
});

describe('cidb and bbbee extractors', () => {
  it('reads CIDB and B-BBEE from notice text', () => {
    assert.equal(cidbFromText('Upgrade of clinic, CIDB 4GB or higher'), '4GB');
    assert.equal(bbbeeFromText('B-BBEE level 2 contribution required'), 'Level 2');
    assert.equal(bbbeeLevelNumber('B-BBEE level 2 contribution required'), 2);
  });
});

describe('officialFetchUrl', () => {
  it('windows the OCDS lookup around the published date', () => {
    const url = officialFetchUrl('ocds-9t57fa-171086', '2026-09-10', new Date('2026-09-24T08:00:00Z'));
    assert.match(url, /dateFrom=2026-08-27/);
    assert.match(url, /dateTo=2026-09-24/);
    assert.match(url, /ocid=ocds-9t57fa-171086/);
  });
});

describe('patchFromRelease', () => {
  it('fills omitted close time, docs and returnables', () => {
    const patch = patchFromRelease({
      tender: {
        id: '171086',
        description: 'Supply of PPE. B-BBEE level 1. CSD and SBD4 required.',
        tenderPeriod: { endDate: '2026-10-02T11:00:00+02:00' },
        documents: [{ url: 'https://example.test/a.pdf', title: 'Invitation' }],
        procurementMethodDetails: 'electronic',
      },
    }, { description: 'short' });
    assert.equal(patch.closing_time, '11:00');
    assert.equal(patch.submission_method, 'electronic');
    assert.ok(patch.documents_json?.includes('Invitation'));
    assert.ok(returnablesFromText(patch.description).some((r) => r.code === 'SBD4'));
  });
});
