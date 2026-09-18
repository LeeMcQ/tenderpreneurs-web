import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { resolveLocation, clusterGeo } from '../../src/lib/tender-location.ts';

describe('resolveLocation', () => {
  it('pins a named town from the title', () => {
    const loc = resolveLocation({
      title: 'Construction of Water Reticulation Scheme in Mqanduli',
      procuring_entity: 'Department of Water and Sanitation',
      province: 'eastern-cape',
    });
    assert.equal(loc.town, 'Mqanduli');
    assert.equal(loc.precision, 'town');
    assert.equal(loc.source, 'title');
    assert.ok(loc.lat && loc.lat < -31);
  });

  it('prefers briefing location over province centroid', () => {
    const loc = resolveLocation({
      title: 'ICT refresh',
      procuring_entity: 'Western Cape Department of Health',
      briefing_location: 'George Civic Centre, York Street',
      province: 'western-cape',
    });
    assert.equal(loc.town, 'George');
    assert.equal(loc.source, 'briefing');
  });

  it('uses the metro named in the procuring entity', () => {
    const loc = resolveLocation({
      title: 'Upgrades to stormwater drainage in the CBD',
      procuring_entity: 'eThekwini Metropolitan Municipality',
      province: 'kwazulu-natal',
    });
    assert.equal(loc.town, 'eThekwini');
    assert.equal(loc.precision, 'metro');
    assert.equal(loc.source, 'entity');
  });

  it('falls back to the province when no town is named', () => {
    const loc = resolveLocation({
      title: 'Panel of legal advisors',
      procuring_entity: 'Limpopo Provincial Treasury',
      province: 'limpopo',
    });
    assert.equal(loc.town, null);
    assert.equal(loc.precision, 'province');
    assert.equal(loc.label, 'Limpopo');
  });

  it('does not invent a town', () => {
    const loc = resolveLocation({
      title: 'National transversal contract for stationery',
      procuring_entity: 'National Treasury',
      province: 'national',
    });
    assert.equal(loc.precision, 'national');
    assert.equal(loc.town, null);
  });
});

describe('clusterGeo', () => {
  it('counts provinces and named towns separately', () => {
    const geo = clusterGeo([
      { id: '1', title: 'Clinic in Delft, Cape Town', procuring_entity: 'City of Cape Town', province: 'western-cape', estimated_value: 100_00 },
      { id: '2', title: 'Road rehab', procuring_entity: 'Western Cape Department of Infrastructure', province: 'western-cape', estimated_value: 200_00 },
      { id: '3', title: 'PPE for hospitals', procuring_entity: 'Gauteng Department of Health', province: 'gauteng', estimated_value: 50_00 },
    ]);
    const wc = geo.provinces.find((p) => p.slug === 'western-cape')!;
    const gp = geo.provinces.find((p) => p.slug === 'gauteng')!;
    assert.equal(wc.count, 2);
    assert.equal(gp.count, 1);
    assert.ok(geo.towns.some((t) => t.name === 'Cape Town' && t.count === 1));
  });
});
