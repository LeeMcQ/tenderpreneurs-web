import type { PlacePrecision } from '../lib/tender-location';
import { PROVINCE_CENTROIDS } from '../lib/tender-location';

export type GeoPayload = {
  ok: boolean;
  total?: number;
  provinces: Array<{ slug: string; name: string; count: number; valueZar: number }>;
  towns: Array<{ name: string; province: string | null; lat: number; lng: number; count: number; precision: PlacePrecision; sector?: string | null }>;
  themes?: Array<{ slug: string; count: number }>;
};

type LeafletMap = {
  setView: Function;
  fitBounds: Function;
  removeLayer: Function;
  addLayer: Function;
  invalidateSize: Function;
  remove: Function;
  on: Function;
};
type LeafletNs = {
  map: Function;
  tileLayer: Function;
  marker: Function;
  divIcon: Function;
  featureGroup: Function;
  latLngBounds: Function;
  markerClusterGroup: Function;
};

declare global {
  interface Window {
    L?: LeafletNs;
  }
}

const OSM_JS = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
const CLUSTER_JS = 'https://unpkg.com/leaflet.markercluster@1.5.3/dist/leaflet.markercluster.js';
const OSM_CSS = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
const CLUSTER_CSS = 'https://unpkg.com/leaflet.markercluster@1.5.3/dist/MarkerCluster.css';

const THEME_LABELS: Record<string, string> = {
  construction: 'Construction',
  ict: 'ICT',
  health: 'Health',
  education: 'Education',
  transport: 'Transport',
  agriculture: 'Agriculture',
  energy: 'Energy',
  security: 'Security',
  consulting: 'Consulting',
  cleaning: 'Cleaning',
  catering: 'Catering',
  legal: 'Legal',
};

const SA_BOUNDS: [[number, number], [number, number]] = [
  [-35.2, 16.3],
  [-22.0, 33.0],
];

let map: LeafletMap | null = null;
let clusterLayer: { clearLayers: Function; addLayers: Function } | null = null;
let leafletReady: Promise<LeafletNs> | null = null;

function loadCss(href: string) {
  if (document.querySelector(`link[href="${href}"]`)) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = href;
  document.head.appendChild(link);
}

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${src}"]`) as HTMLScriptElement | null;
    if (existing) {
      if ((existing as any).dataset.loaded === '1') return resolve();
      existing.addEventListener('load', () => resolve());
      existing.addEventListener('error', () => reject(new Error(src)));
      return;
    }
    const s = document.createElement('script');
    s.src = src;
    s.async = true;
    s.addEventListener('load', () => {
      (s as any).dataset.loaded = '1';
      resolve();
    });
    s.addEventListener('error', () => reject(new Error(src)));
    document.head.appendChild(s);
  });
}

function ensureLeaflet(): Promise<LeafletNs> {
  if (window.L?.markerClusterGroup) return Promise.resolve(window.L);
  if (leafletReady) return leafletReady;
  loadCss(OSM_CSS);
  loadCss(CLUSTER_CSS);
  leafletReady = loadScript(OSM_JS)
    .then(() => loadScript(CLUSTER_JS))
    .then(() => {
      if (!window.L?.markerClusterGroup) throw new Error('Leaflet cluster missing');
      return window.L;
    });
  return leafletReady;
}

function countLabel(n: number): string {
  if (n >= 100) return '100+';
  if (n >= 50) return '50+';
  if (n >= 20) return '20+';
  if (n >= 10) return '10+';
  return String(n);
}

function heatClass(n: number): string {
  if (n >= 20) return 'is-red is-xl';
  if (n >= 10) return 'is-red is-lg';
  if (n >= 5) return 'is-amber is-md';
  return 'is-amber is-sm';
}

function rippleHtml(n: number): string {
  return `<div class="tp-ripple ${heatClass(n)}"><span class="core">${countLabel(n)}</span></div>`;
}

function pinColor(sector?: string | null): string {
  if (sector === 'health') return '#b91c1c';
  if (sector === 'construction') return '#9a3412';
  if (sector === 'education') return '#1d4ed8';
  if (sector === 'ict') return '#0f766e';
  if (sector === 'security') return '#334155';
  if (sector === 'transport') return '#1e3a8a';
  if (sector === 'agriculture') return '#3f6212';
  if (sector === 'legal') return '#6b21a8';
  if (sector === 'energy') return '#b45309';
  return '#e11d48';
}

function pinMark(sector?: string | null): string {
  if (sector === 'health') return '<path d="M13 9h-2v3H8v2h3v3h2v-3h3v-2h-3z" fill="#fff"/>';
  if (sector === 'construction') return '<path d="M8 16V10l4-3 4 3v6H8z" fill="#fff"/>';
  if (sector === 'education') return '<path d="M7 12l6-3 6 3-6 3-6-3zm2 2v3l4 2 4-2v-3" fill="none" stroke="#fff" stroke-width="1.6"/>';
  if (sector === 'transport') return '<path d="M8 14h10l-1.5-4H10L8 14zm2 .5a1.2 1.2 0 110 2.4 1.2 1.2 0 010-2.4zm7 0a1.2 1.2 0 110 2.4 1.2 1.2 0 010-2.4z" fill="#fff"/>';
  if (sector === 'ict') return '<rect x="9" y="9" width="8" height="8" rx="1.4" fill="none" stroke="#fff" stroke-width="1.6"/>';
  if (sector === 'security') return '<path d="M13 8l5 2v3c0 3-2.2 5.2-5 6-2.8-.8-5-3-5-6v-3l5-2z" fill="#fff"/>';
  if (sector === 'agriculture') return '<path d="M13 18c0-5 4-7 5-10-4 0-7 3-8 7 0-4-2-6-5-7 3 4 3 8 3 10h5z" fill="#fff"/>';
  if (sector === 'legal') return '<path d="M13 8v10M9 12h8M9 12l-2 4h4m8-4l2 4h-4" fill="none" stroke="#fff" stroke-width="1.6"/>';
  return '<circle cx="13" cy="12.5" r="3" fill="#fff"/>';
}

function pinHtml(sector?: string | null): string {
  const fill = pinColor(sector);
  return `<div class="tp-pin"><svg viewBox="0 0 26 36" width="28" height="36" aria-hidden="true"><path d="M13 1C7 1 2.5 6 2.5 12.2 2.5 21 13 35 13 35s10.5-14 10.5-22.8C23.5 6 19 1 13 1z" fill="${fill}" stroke="#fff" stroke-width="1.6"/>${pinMark(sector)}</svg></div>`;
}

function placeBubbles(geo: GeoPayload) {
  const used = new Map<string, number>();
  for (const town of geo.towns) {
    if (town.province) used.set(town.province, (used.get(town.province) ?? 0) + town.count);
  }
  const bubbles: Array<{
    lat: number;
    lng: number;
    count: number;
    label: string;
    province: string | null;
    kind: 'town' | 'province';
    sector?: string | null;
  }> = geo.towns.map((t) => ({
    lat: t.lat,
    lng: t.lng,
    count: t.count,
    label: t.name,
    province: t.province,
    kind: 'town',
    sector: t.sector,
  }));
  for (const p of geo.provinces) {
    if (p.slug === 'national' || p.count === 0) continue;
    const named = used.get(p.slug) ?? 0;
    const rest = Math.max(0, p.count - named);
    if (rest === 0) continue;
    const c = PROVINCE_CENTROIDS[p.slug];
    if (!c) continue;
    bubbles.push({
      lat: c.lat,
      lng: c.lng,
      count: rest,
      label: `${p.name} (province)`,
      province: p.slug,
      kind: 'province',
    });
  }
  return bubbles;
}

function renderThemes(host: HTMLElement, geo: GeoPayload, selected: string, onTheme: (slug: string) => void) {
  const themes = geo.themes ?? [];
  const items = [`<button type="button" class="theme-chip${selected ? '' : ' is-on'}" data-theme="">All sectors</button>`]
    .concat(
      themes.slice(0, 10).map((t) => {
        const label = THEME_LABELS[t.slug] ?? t.slug;
        return `<button type="button" class="theme-chip${selected === t.slug ? ' is-on' : ''}" data-theme="${t.slug}">${label} <em>${t.count}</em></button>`;
      }),
    );
  host.innerHTML = items.join('');
  host.querySelectorAll<HTMLButtonElement>('[data-theme]').forEach((btn) => {
    btn.addEventListener('click', () => onTheme(btn.getAttribute('data-theme') || ''));
  });
}

export async function renderMap(
  el: HTMLElement,
  geo: GeoPayload,
  selectedProvince: string,
  selectedTheme: string,
  onProvince: (slug: string) => void,
  onTown: (name: string) => void,
  onTheme: (slug: string) => void,
) {
  const national = geo.provinces.find((p) => p.slug === 'national');
  if (!el.querySelector('.osm-shell')) {
    el.innerHTML = `
      <div class="osm-shell">
      <div class="map-head">
        <div>
          <h2>Where the work is needed</h2>
          <p>Ripple bubbles are counts. Zoom in to split them. A single notice becomes a map pin for its sector.</p>
        </div>
        <p class="map-national">${national?.count ?? 0} national</p>
      </div>
      <div class="theme-row" id="map-themes" role="listbox" aria-label="Sector theme"></div>
      <div id="osm-map" class="osm-map" role="application" aria-label="South Africa tender map"></div>
      <ol class="map-legend">
        <li><i class="dot"></i>Red ripple = many notices</li>
        <li><i class="dot is-prov"></i>Amber ripple = fewer</li>
        <li>Pin = one tender, mark = sector</li>
      </ol>
      </div>
    `;
  } else {
    const nat = el.querySelector('.map-national');
    if (nat) nat.textContent = `${national?.count ?? 0} national`;
  }

  const themeHost = el.querySelector('#map-themes') as HTMLElement | null;
  if (themeHost) renderThemes(themeHost, geo, selectedTheme, onTheme);

  const L = await ensureLeaflet();
  const mapNode = el.querySelector('#osm-map') as HTMLElement;
  if (!mapNode) return;

  if (!map) {
    map = L.map(mapNode, {
      zoomControl: true,
      attributionControl: true,
      minZoom: 5,
      maxZoom: 16,
      maxBounds: SA_BOUNDS,
      maxBoundsViscosity: 0.8,
    });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19,
    }).addTo(map);
    map.setView([-28.5, 24.7], 5);
    clusterLayer = L.markerClusterGroup({
      showCoverageOnHover: false,
      maxClusterRadius: 58,
      spiderfyOnMaxZoom: true,
      disableClusteringAtZoom: 12,
      zoomToBoundsOnClick: true,
      iconCreateFunction(cluster: { getAllChildMarkers: () => Array<{ options?: { count?: number } }> }) {
        const n = cluster.getAllChildMarkers().reduce((sum, m) => sum + (m.options?.count || 1), 0);
        return L.divIcon({
          html: rippleHtml(n),
          className: '',
          iconSize: [52, 52],
        });
      },
    });
    map.addLayer(clusterLayer);
  }

  clusterLayer!.clearLayers();
  const bubbles = placeBubbles(geo);
  const markers = bubbles.map((b) => {
    const single = b.count === 1 && b.kind === 'town';
    const marker = L.marker([b.lat, b.lng], {
      count: b.count,
      icon: L.divIcon({
        html: single ? pinHtml(b.sector) : rippleHtml(b.count),
        className: '',
        iconSize: single ? [28, 36] : [52, 52],
        iconAnchor: single ? [14, 34] : [26, 26],
      }),
      title: `${b.label}: ${b.count} open`,
    });
    marker.on('click', () => {
      if (b.kind === 'town') onTown(b.label.replace(/ \(province\)$/, ''));
      else if (b.province) onProvince(selectedProvince === b.province ? '' : b.province);
    });
    return marker;
  });
  clusterLayer!.addLayers(markers);

  if (selectedProvince && PROVINCE_CENTROIDS[selectedProvince] && selectedProvince !== 'national') {
    const c = PROVINCE_CENTROIDS[selectedProvince];
    map!.setView([c.lat, c.lng], 7);
  }

  requestAnimationFrame(() => map?.invalidateSize());
}

export function invalidateTenderMap() {
  requestAnimationFrame(() => map?.invalidateSize());
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
