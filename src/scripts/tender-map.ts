import type { PlacePrecision } from '../lib/tender-location';
import { PROVINCE_SHAPES, project, ringToPath } from '../lib/sa-province-shapes';

export type GeoPayload = {
  ok: boolean;
  provinces: Array<{ slug: string; name: string; count: number; valueZar: number }>;
  towns: Array<{ name: string; province: string | null; lat: number; lng: number; count: number; precision: PlacePrecision }>;
};

function fillForCount(count: number, max: number): string {
  if (!count || max <= 0) return '#D9E2EA';
  const t = Math.min(1, count / max);
  if (t > 0.8) return '#0C1B33';
  if (t > 0.55) return '#1B4F8A';
  if (t > 0.3) return '#3D70AE';
  if (t > 0.12) return '#8AA8C9';
  return '#C5D4E3';
}

export function renderMap(el: HTMLElement, geo: GeoPayload, selectedProvince: string, onProvince: (slug: string) => void, onTown: (name: string) => void) {
  const max = Math.max(1, ...geo.provinces.map((p) => p.count));
  const bySlug = new Map(geo.provinces.map((p) => [p.slug, p]));
  const paths = Object.entries(PROVINCE_SHAPES)
    .map(([slug, ring]) => {
      const bucket = bySlug.get(slug);
      const selected = selectedProvince === slug;
      return `<path data-province="${slug}" class="sa-prov${selected ? ' is-on' : ''}" d="${ringToPath(ring)}" fill="${selected ? '#F5A623' : fillForCount(bucket?.count ?? 0, max)}" stroke="#F3F0E8" stroke-width="1.4">
        <title>${bucket?.name ?? slug}: ${bucket?.count ?? 0} open</title>
      </path>`;
    })
    .join('');

  const towns = geo.towns
    .filter((t) => t.precision === 'town' || t.precision === 'metro')
    .slice(0, 36)
    .map((t) => {
      const { x, y } = project(t.lng, t.lat);
      const r = Math.min(9, 3.2 + Math.sqrt(t.count) * 1.6);
      return `<g class="sa-town" data-town="${t.name.replace(/"/g, '')}" transform="translate(${x.toFixed(1)} ${y.toFixed(1)})">
        <circle r="${r.toFixed(1)}" fill="#F5A623" stroke="#0C1B33" stroke-width="1.1" opacity="0.95"></circle>
        <title>${t.name} · ${t.count} named location${t.count === 1 ? '' : 's'}</title>
      </g>`;
    })
    .join('');

  const national = bySlug.get('national');
  el.innerHTML = `
    <div class="map-head">
      <div>
        <h2>Where tenders sit</h2>
        <p>Province fill is volume. Dots are towns named in the notice, entity, or briefing — nothing is geocoded beyond that.</p>
      </div>
      <p class="map-national">${national?.count ?? 0} national</p>
    </div>
    <svg class="sa-svg" viewBox="0 0 720 560" role="img" aria-label="South Africa tender concentration by province and named town">
      ${paths}${towns}
    </svg>
    <ol class="map-legend">
      <li><i style="background:#C5D4E3"></i>Fewer</li>
      <li><i style="background:#1B4F8A"></i>More</li>
      <li><i class="dot"></i>Named town</li>
    </ol>
  `;

  el.querySelectorAll<SVGPathElement>('path[data-province]').forEach((path) => {
    path.addEventListener('click', () => {
      const slug = path.getAttribute('data-province') || '';
      onProvince(selectedProvince === slug ? '' : slug);
    });
  });
  el.querySelectorAll<SVGGElement>('g[data-town]').forEach((g) => {
    g.addEventListener('click', (e) => {
      e.stopPropagation();
      onTown(g.getAttribute('data-town') || '');
    });
  });
}

export function renderDensity(el: HTMLElement, geo: GeoPayload, selected: string) {
  const ordered = ['western-cape', 'northern-cape', 'eastern-cape', 'free-state', 'kwazulu-natal', 'north-west', 'gauteng', 'mpumalanga', 'limpopo'];
  const max = Math.max(1, ...geo.provinces.map((p) => p.count));
  const bySlug = new Map(geo.provinces.map((p) => [p.slug, p]));
  el.innerHTML = ordered.map((slug) => {
    const b = bySlug.get(slug);
    const codes: Record<string, string> = {
      'western-cape': 'WC', 'northern-cape': 'NC', 'eastern-cape': 'EC',
      'free-state': 'FS', 'kwazulu-natal': 'KZN', 'north-west': 'NW',
      gauteng: 'GP', mpumalanga: 'MP', limpopo: 'LP',
    };
    const short = codes[slug] ?? slug;
    return `<button type="button" class="dens-cell${selected === slug ? ' is-on' : ''}" data-province="${slug}" style="--heat:${(b?.count ?? 0) / max}">
      <span class="dens-bar"></span><span class="dens-code">${short}</span>
    </button>`;
  }).join('');
}
