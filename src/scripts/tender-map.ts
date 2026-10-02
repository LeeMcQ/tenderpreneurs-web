import type { PlacePrecision } from '../lib/tender-location';
import { PROVINCE_CENTROIDS } from '../lib/tender-location';

export type GeoPin = {
  id: string; lat: number; lng: number; sector?: string | null; precision?: string;
  label?: string; basis?: string; title?: string; entity?: string; closing?: string | null; province?: string;
};
export type GeoPayload = {
  ok: boolean; total?: number;
  provinces: Array<{ slug: string; name: string; count: number; valueZar: number }>;
  towns: Array<{ name: string; province: string | null; lat: number; lng: number; count: number; precision?: PlacePrecision; sector?: string | null; ids?: string[] }>;
  themes?: Array<{ slug: string; count: number }>;
  pins?: GeoPin[];
};
type LeafletMap = { setView: Function; fitBounds: Function; removeLayer: Function; addLayer: Function; invalidateSize: Function; remove: Function; on: Function };
type LeafletNs = { map: Function; tileLayer: Function; marker: Function; divIcon: Function; featureGroup: Function; latLngBounds: Function; markerClusterGroup: Function; control: any; circle: Function; popup: Function };
declare global { interface Window { L?: LeafletNs } }

const OSM_JS = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
const CLUSTER_JS = 'https://unpkg.com/leaflet.markercluster@1.5.3/dist/leaflet.markercluster.js';
const OSM_CSS = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
const CLUSTER_CSS = 'https://unpkg.com/leaflet.markercluster@1.5.3/dist/MarkerCluster.css';
const THEME_LABELS: Record<string, string> = {
  construction: 'Construction', ict: 'ICT', health: 'Health', education: 'Education',
  transport: 'Transport', agriculture: 'Agriculture', energy: 'Energy', security: 'Security',
  consulting: 'Consulting', cleaning: 'Cleaning', catering: 'Catering', legal: 'Legal',
};
const SA_BOUNDS: [[number, number], [number, number]] = [[-35.2, 16.3], [-22.0, 33.0]];
let map: LeafletMap | null = null;
let clusterLayer: { clearLayers: Function; addLayers: Function; on?: Function } | null = null;
let washLayer: { clearLayers: Function; addLayer: Function } | null = null;
let leafletReady: Promise<LeafletNs> | null = null;
let townHandler: ((name: string, ids?: string[]) => void) | null = null;
let provinceHandler: ((slug: string) => void) | null = null;
const byId = new Map<string, any>();
let lastPins: GeoPin[] = [];

function loadCss(href: string) {
  if (document.querySelector(`link[href="${href}"]`)) return;
  const link = document.createElement('link'); link.rel = 'stylesheet'; link.href = href; document.head.appendChild(link);
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
    s.src = src; s.async = true;
    s.addEventListener('load', () => { (s as any).dataset.loaded = '1'; resolve(); });
    s.addEventListener('error', () => reject(new Error(src)));
    document.head.appendChild(s);
  });
}
function ensureLeaflet(): Promise<LeafletNs> {
  if (window.L?.markerClusterGroup) return Promise.resolve(window.L);
  if (leafletReady) return leafletReady;
  loadCss(OSM_CSS); loadCss(CLUSTER_CSS);
  leafletReady = loadScript(OSM_JS).then(() => loadScript(CLUSTER_JS)).then(() => {
    if (!window.L?.markerClusterGroup) throw new Error('Leaflet cluster missing');
    return window.L;
  });
  return leafletReady;
}
function esc(s: string): string { return s.replace(/[&<>"]/g, (c) => ({ '&': '&', '<': '<', '>': '>', '"': '"' }[c] || c)); }
function placeName(label?: string): string { return (label || 'Place').split('\u00b7')[0].trim(); }
function soon(closing?: string | null): boolean {
  if (!closing) return false;
  const d = new Date(`${closing}T12:00:00Z`).getTime();
  return d - Date.now() < 8 * 86400000;
}
function pinColor(sector?: string | null): string {
  if (sector === 'health') return '#b91c1c';
  if (sector === 'construction') return '#c2410c';
  if (sector === 'education') return '#1d4ed8';
  if (sector === 'ict') return '#0f766e';
  if (sector === 'transport') return '#1e3a8a';
  if (sector === 'agriculture') return '#3f6212';
  return '#e11d48';
}
function cardHtml(p: GeoPin): string {
  const why = (p.label || 'Location').replace('\u00b7', '\u2014');
  return `<div class="pin-card"><strong>${esc(p.title || placeName(p.label))}</strong><p>${esc(p.entity || '')}</p><p class="pin-why">${esc(why)}${p.closing ? ` \u00b7 closes ${esc(p.closing)}` : ''}</p><a href="/tenders/t/${p.id}">Open notice</a></div>`;
}
function pinHtml(p: GeoPin, hollow: boolean): string {
  const fill = hollow ? 'none' : pinColor(p.sector);
  const stroke = pinColor(p.sector);
  return `<div class="tp-pin${hollow ? ' is-office' : ' is-site'}${soon(p.closing) ? ' is-soon' : ''}" data-pin="${p.id}"><svg viewBox="0 0 26 36" width="26" height="34" aria-hidden="true"><path d="M13 1C7 1 2.5 6 2.5 12.2 2.5 21 13 35 13 35s10.5-14 10.5-22.8C23.5 6 19 1 13 1z" fill="${fill}" stroke="${stroke}" stroke-width="1.8"/>${hollow ? '' : '<circle cx="13" cy="12" r="3.2" fill="#fff"/>'}</svg></div>`;
}
function placeBubble(name: string, n: number, kind: string, urgent: boolean): string {
  return `<div class="place-bubble${urgent ? ' is-soon' : ''}"><b>${n}</b><span>${esc(name)}</span><em>${kind}</em></div>`;
}
function km(a: GeoPin, lat: number, lng: number): number {
  const r = 6371;
  const dLat = (a.lat - lat) * Math.PI / 180;
  const dLng = (a.lng - lng) * Math.PI / 180;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(lat * Math.PI / 180) * Math.cos(a.lat * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * r * Math.asin(Math.min(1, Math.sqrt(s)));
}
function nearMe(paid: boolean) {
  if (!paid) { window.location.href = '/pricing?reason=near_me'; return; }
  if (!navigator.geolocation) return;
  navigator.geolocation.getCurrentPosition((pos) => {
    const { latitude, longitude } = pos.coords;
    const hits = lastPins.filter((p) => p.basis !== 'province' && km(p, latitude, longitude) <= 80);
    if (townHandler) townHandler('Within 80 km', hits.slice(0, 40).map((p) => p.id));
    if (hits.length && map) map.fitBounds(hits.map((p) => [p.lat, p.lng]), { padding: [24, 24], maxZoom: 10 });
  });
}
export function highlightPin(id: string) {
  document.querySelectorAll('.tp-pin.is-hot').forEach((n) => n.classList.remove('is-hot'));
  document.querySelectorAll(`[data-pin="${id}"]`).forEach((n) => n.classList.add('is-hot'));
  const marker = byId.get(id);
  if (marker && map) {
    const ll = marker.getLatLng?.();
    if (ll) map.setView([ll.lat, ll.lng], 11);
    marker.openPopup?.();
  }
}
export async function renderMap(el: HTMLElement, geo: GeoPayload, selectedProvince: string, selectedTheme: string, onProvince: (slug: string) => void, onTown: (name: string, ids?: string[]) => void, onTheme: (slug: string) => void) {
  townHandler = onTown; provinceHandler = onProvince;
  lastPins = geo.pins || [];
  const paid = el.dataset.paid === '1';
  if (!el.querySelector('.osm-shell')) {
    el.innerHTML = `<div class="osm-shell"><div class="map-head"><div><h2>Where the work is needed</h2><p>Solid pin is the work site. Hollow pin is the issuing office. A shaded province is not a site.</p></div><p class="map-national">${lastPins.length} placed</p></div><div class="map-tools"><button type="button" id="near-me" class="theme-chip">${paid ? 'Near me \u00b7 80 km' : 'Near me \u00b7 paid plan'}</button><div class="theme-row" id="map-themes"></div></div><div id="osm-map" class="osm-map" role="application" aria-label="South Africa tender map"></div><ol class="map-legend"><li><i class="swatch site"></i>Work site</li><li><i class="swatch office"></i>Issuing office</li><li><i class="swatch wash"></i>Province only</li></ol></div>`;
    el.querySelector('#near-me')?.addEventListener('click', () => nearMe(paid));
  } else {
    const nat = el.querySelector('.map-national'); if (nat) nat.textContent = `${lastPins.length} placed`;
  }
  const themeHost = el.querySelector('#map-themes') as HTMLElement | null;
  if (themeHost) {
    const themes = geo.themes ?? [];
    themeHost.innerHTML = [`<button type="button" class="theme-chip${selectedTheme ? '' : ' is-on'}" data-theme="">All</button>`].concat(themes.slice(0, 8).map((t) => `<button type="button" class="theme-chip${selectedTheme === t.slug ? ' is-on' : ''}" data-theme="${t.slug}">${THEME_LABELS[t.slug] ?? t.slug}</button>`)).join('');
    themeHost.querySelectorAll<HTMLButtonElement>('[data-theme]').forEach((btn) => btn.addEventListener('click', () => onTheme(btn.getAttribute('data-theme') || '')));
  }
  const L = await ensureLeaflet();
  const mapNode = el.querySelector('#osm-map') as HTMLElement;
  if (!mapNode) return;
  if (!map) {
    map = L.map(mapNode, { zoomControl: true, attributionControl: true, minZoom: 5, maxZoom: 17, maxBounds: SA_BOUNDS, maxBoundsViscosity: 0.8 });
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', { attribution: '&copy; OSM &copy; CARTO', subdomains: 'abcd', maxZoom: 19 }).addTo(map);
    L.control.scale({ imperial: false, position: 'bottomleft' }).addTo(map);
    map.setView([-28.5, 24.7], 5);
    washLayer = L.featureGroup().addTo(map);
    clusterLayer = L.markerClusterGroup({ showCoverageOnHover: false, maxClusterRadius: 36, disableClusteringAtZoom: 11, zoomToBoundsOnClick: true, iconCreateFunction(cluster: any) {
      const kids = cluster.getAllChildMarkers();
      const name = kids.find((m: any) => m.options?.townName)?.options?.townName || 'Area';
      const n = kids.reduce((s: number, m: any) => s + (m.options?.count || 1), 0);
      return L.divIcon({ html: placeBubble(name, n, 'places', false), className: '', iconSize: [92, 36] });
    } });
    map.addLayer(clusterLayer);
  }
  washLayer?.clearLayers();
  clusterLayer!.clearLayers();
  byId.clear();
  const provincePins = lastPins.filter((p) => p.basis === 'province');
  const placed = lastPins.filter((p) => p.basis !== 'province');
  const byProvince = new Map<string, number>();
  for (const p of provincePins) byProvince.set(p.province || 'national', (byProvince.get(p.province || 'national') || 0) + 1);
  for (const [slug, count] of byProvince) {
    const c = PROVINCE_CENTROIDS[slug];
    if (!c) continue;
    const circle = L.circle([c.lat, c.lng], { radius: 70000, color: '#94a3b8', weight: 1, fillColor: '#94a3b8', fillOpacity: 0.16 });
    circle.bindTooltip(`${c.name} \u00b7 ${count} province only`, { sticky: true });
    circle.on('click', () => provinceHandler && provinceHandler(slug));
    washLayer?.addLayer(circle);
  }
  const groups = new Map<string, GeoPin[]>();
  for (const p of placed) {
    const key = placeName(p.label).toLowerCase();
    const list = groups.get(key) || []; list.push(p); groups.set(key, list);
  }
  const markers = [...groups.values()].map((group) => {
    const first = group[0];
    const hollow = first.basis !== 'work' && first.basis !== 'gps';
    const name = placeName(first.label);
    const kind = hollow ? 'offices' : 'sites';
    const marker = group.length === 1
      ? L.marker([first.lat, first.lng], { count: 1, ids: [first.id], townName: name, icon: L.divIcon({ html: pinHtml(first, hollow), className: '', iconSize: [26, 34], iconAnchor: [13, 32] }) })
      : L.marker([first.lat, first.lng], { count: group.length, ids: group.map((g) => g.id), townName: name, icon: L.divIcon({ html: placeBubble(name, group.length, kind, group.some((g) => soon(g.closing))), className: '', iconSize: [92, 36], iconAnchor: [46, 18] }) });
    if (group.length === 1) marker.bindPopup(cardHtml(first), { className: 'pin-popup' });
    marker.on('click', () => onTown(name, group.slice(0, 40).map((g) => g.id)));
    group.forEach((g) => byId.set(g.id, marker));
    return marker;
  });
  clusterLayer!.addLayers(markers);
  if (selectedProvince && PROVINCE_CENTROIDS[selectedProvince] && selectedProvince !== 'national') {
    const c = PROVINCE_CENTROIDS[selectedProvince];
    map!.setView([c.lat, c.lng], 8);
  }
  requestAnimationFrame(() => map?.invalidateSize());
}
export function invalidateTenderMap() { requestAnimationFrame(() => map?.invalidateSize()); }
export function renderDensity(el: HTMLElement, geo: GeoPayload, selected: string) {
  const ordered = ['western-cape', 'northern-cape', 'eastern-cape', 'free-state', 'kwazulu-natal', 'north-west', 'gauteng', 'mpumalanga', 'limpopo'];
  const max = Math.max(1, ...geo.provinces.map((p) => p.count));
  const bySlug = new Map(geo.provinces.map((p) => [p.slug, p]));
  const codes: Record<string, string> = { 'western-cape': 'WC', 'northern-cape': 'NC', 'eastern-cape': 'EC', 'free-state': 'FS', 'kwazulu-natal': 'KZN', 'north-west': 'NW', gauteng: 'GP', mpumalanga: 'MP', limpopo: 'LP' };
  el.innerHTML = ordered.map((slug) => {
    const b = bySlug.get(slug);
    return `<button type="button" class="dens-cell${selected === slug ? ' is-on' : ''}" data-province="${slug}" style="--heat:${(b?.count ?? 0) / max}"><span class="dens-bar"></span><span class="dens-code">${codes[slug]}</span></button>`;
  }).join('');
}
