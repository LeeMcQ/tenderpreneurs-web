import type { PlacePrecision } from '../lib/tender-location';
import { PROVINCE_CENTROIDS } from '../lib/tender-location';

export type GeoPayload = {
  ok: boolean;
  total?: number;
  provinces: Array<{ slug: string; name: string; count: number; valueZar: number }>;
  towns: Array<{ name: string; province: string | null; lat: number; lng: number; count: number; precision: PlacePrecision }>;
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

function bubbleClass(count: number): string {
  if (count >= 80) return 'is-xl';
  if (count >= 25) return 'is-lg';
  if (count >= 8) return 'is-md';
  return 'is-sm';
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
  }> = geo.towns.map((t) => ({
    lat: t.lat,
    lng: t.lng,
    count: t.count,
    label: t.name,
    province: t.province,
    kind: 'town',
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
          <h2>Where tenders sit</h2>
          <p>OpenStreetMap. Numbered bubbles are counts. Zoom in and clusters split into towns.</p>
        </div>
        <p class="map-national">${national?.count ?? 0} national</p>
      </div>
      <div class="theme-row" id="map-themes" role="listbox" aria-label="Sector theme"></div>
      <div id="osm-map" class="osm-map" role="application" aria-label="South Africa tender map"></div>
      <ol class="map-legend">
        <li><i class="dot"></i>Town named in the notice</li>
        <li><i class="dot is-prov"></i>Province only</li>
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
      maxZoom: 12,
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
      maxClusterRadius: 54,
      spiderfyOnMaxZoom: true,
      disableClusteringAtZoom: 10,
      zoomToBoundsOnClick: true,
      iconCreateFunction(cluster: { getAllChildMarkers: () => Array<{ options?: { count?: number } }> }) {
        const n = cluster.getAllChildMarkers().reduce((sum, m) => sum + (m.options?.count || 1), 0);
        return L.divIcon({
          html: `<span>${n}</span>`,
          className: `tp-bubble is-cluster ${bubbleClass(n)}`,
          iconSize: [44, 44],
        });
      },
    });
    map.addLayer(clusterLayer);
  }

  clusterLayer!.clearLayers();
  const bubbles = placeBubbles(geo);
  const markers = bubbles.map((b) => {
    const marker = L.marker([b.lat, b.lng], {
      count: b.count,
      icon: L.divIcon({
        html: `<span>${b.count}</span>`,
        className: `tp-bubble ${b.kind === 'town' ? 'is-town' : 'is-prov'} ${bubbleClass(b.count)}${selectedProvince && b.province === selectedProvince ? ' is-on' : ''}`,
        iconSize: [36, 36],
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
