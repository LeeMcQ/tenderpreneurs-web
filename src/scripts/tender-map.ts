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
let leafletReady: Promise<LeafletNs> | null = null;
let townHandler: ((name: string, ids?: string[]) => void) | null = null;
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
function countLabel(n: number): string {
  if (n >= 100) return '100+'; if (n >= 50) return '50+'; if (n >= 20) return '20+'; if (n >= 10) return '10+'; return String(n);
}
function heatClass(n: number): string {
  if (n >= 20) return 'is-red is-xl'; if (n >= 10) return 'is-red is-lg'; if (n >= 5) return 'is-amber is-md'; return 'is-amber is-sm';
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
function pinHtml(p: GeoPin): string {
  return `<div class="tp-pin" data-pin="${p.id}"><svg viewBox="0 0 26 36" width="26" height="34" aria-hidden="true"><path d="M13 1C7 1 2.5 6 2.5 12.2 2.5 21 13 35 13 35s10.5-14 10.5-22.8C23.5 6 19 1 13 1z" fill="${pinColor(p.sector)}" stroke="#fff" stroke-width="1.6"/>${pinMark(p.sector)}</svg></div>`;
}
function cardHtml(p: GeoPin): string {
  const why = (p.label || 'Location').replace('\u00b7', ' \u2014 ');
  return `<div class="pin-card"><strong>${esc(p.title || placeName(p.label))}</strong><p>${esc(p.entity || '')}</p><p class="pin-why">${esc(why)}${p.closing ? ` \u00b7 closes ${esc(p.closing)}` : ''}</p><a href="/tenders/t/${p.id}">Open notice</a></div>`;
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
  townHandler = onTown;
  lastPins = geo.pins || [];
  const paid = el.dataset.paid === '1';
  if (!el.querySelector('.osm-shell')) {
    el.innerHTML = `<div class="osm-shell"><div class="map-head"><div><h2>Where the work is needed</h2><p>Every open notice is a pin. Zoom to split the count bubbles.</p></div><p class="map-national">${lastPins.length} pins</p></div><div class="map-tools"><button type="button" id="near-me" class="theme-chip">${paid ? 'Near me \u00b7 80 km' : 'Near me \u00b7 paid plan'}</button><div class="theme-row" id="map-themes"></div></div><div id="osm-map" class="osm-map" role="application" aria-label="South Africa tender map"></div><ol class="map-legend"><li><i class="dot"></i>Ripple = cluster of notices</li><li>Pin = one tender</li></ol></div>`;
    el.querySelector('#near-me')?.addEventListener('click', () => nearMe(paid));
  } else {
    const nat = el.querySelector('.map-national'); if (nat) nat.textContent = `${lastPins.length} pins`;
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
    clusterLayer = L.markerClusterGroup({
      showCoverageOnHover: false, maxClusterRadius: 48, spiderfyOnMaxZoom: true, disableClusteringAtZoom: 13, zoomToBoundsOnClick: true,
      iconCreateFunction(cluster: any) {
        const n = cluster.getAllChildMarkers().reduce((sum: number, m: any) => sum + (m.options?.count || 1), 0);
        return L.divIcon({ html: rippleHtml(n), className: '', iconSize: [52, 52] });
      },
    });
    clusterLayer.on?.('clusterclick', (e: any) => {
      const kids = e.layer?.getAllChildMarkers?.() ?? [];
      const ids = kids.flatMap((m: any) => m.options?.ids || []);
      if (ids.length && townHandler) townHandler('cluster', ids.slice(0, 40));
    });
    map.addLayer(clusterLayer);
  }
  clusterLayer!.clearLayers();
  byId.clear();
  const markers = lastPins.map((p) => {
    const marker = L.marker([p.lat, p.lng], {
      count: 1, ids: [p.id], townName: placeName(p.label),
      icon: L.divIcon({ html: pinHtml(p), className: '', iconSize: [26, 34], iconAnchor: [13, 32] }),
      title: p.label || p.id,
    });
    marker.bindPopup(cardHtml(p), { className: 'pin-popup' });
    marker.on('click', () => onTown(placeName(p.label), [p.id]));
    byId.set(p.id, marker);
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
