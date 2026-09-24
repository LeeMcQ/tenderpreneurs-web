import { DEMO_TENDERS, urgencyTone, type DemoTender } from '../data/map-demo';

type LeafletNs = {
  map: Function;
  tileLayer: Function;
  marker: Function;
  divIcon: Function;
  markerClusterGroup: Function;
};
declare global { interface Window { L?: LeafletNs } }

const OSM_JS = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
const CLUSTER_JS = 'https://unpkg.com/leaflet.markercluster@1.5.3/dist/leaflet.markercluster.js';
const OSM_CSS = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
const CLUSTER_CSS = 'https://unpkg.com/leaflet.markercluster@1.5.3/dist/MarkerCluster.css';

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
      existing.addEventListener('error', () => reject());
      return;
    }
    const s = document.createElement('script');
    s.src = src;
    s.async = true;
    s.addEventListener('load', () => { (s as any).dataset.loaded = '1'; resolve(); });
    s.addEventListener('error', () => reject());
    document.head.appendChild(s);
  });
}

function toneOf(tenders: DemoTender[]): 'hot' | 'soon' | 'later' {
  const days = Math.min(...tenders.map((t) => t.closeDays));
  return urgencyTone(days);
}

function renderCards(ids: string[] | null) {
  const list = document.getElementById('demo-list');
  const meta = document.getElementById('demo-meta');
  if (!list) return;
  const rows = ids ? DEMO_TENDERS.filter((t) => ids.includes(t.id)) : DEMO_TENDERS;
  if (meta) {
    meta.textContent = ids
      ? `${rows.length} tender${rows.length === 1 ? '' : 's'} in this cluster`
      : '20 sample notices \u00b7 click a bubble to filter this list';
  }
  list.innerHTML = rows.map((t) => {
    const tone = urgencyTone(t.closeDays);
    return `<article class="demo-card" data-id="${t.id}">
      <div class="demo-rail tone-${tone}">
        <p class="ref">${t.bid}</p>
        <p class="when">Closes in ${t.closeDays}d</p>
        <p class="prec">${t.pin.precision}</p>
      </div>
      <div>
        <h2>${t.title}</h2>
        <p class="entity">${t.entity} \u00b7 issued from ${t.issuedFrom}</p>
        <p class="why"><strong>Pinned:</strong> ${t.pin.label} \u2014 ${t.pin.reason}</p>
      </div>
    </article>`;
  }).join('');
}

export async function bootMapDemo() {
  renderCards(null);
  loadCss(OSM_CSS);
  loadCss(CLUSTER_CSS);
  await loadScript(OSM_JS);
  await loadScript(CLUSTER_JS);
  const L = window.L;
  const host = document.getElementById('demo-osm');
  if (!L?.markerClusterGroup || !host) return;

  const map = L.map(host, {
    zoomControl: true,
    minZoom: 5,
    maxZoom: 16,
  });
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap',
    maxZoom: 19,
  }).addTo(map);
  map.setView([-28.6, 24.8], 5);

  const cluster = L.markerClusterGroup({
    showCoverageOnHover: false,
    maxClusterRadius: 60,
    spiderfyOnMaxZoom: true,
    zoomToBoundsOnClick: true,
    disableClusteringAtZoom: 12,
    iconCreateFunction(cl: { getAllChildMarkers: () => Array<{ options?: { tender?: DemoTender } }> }) {
      const kids = cl.getAllChildMarkers().map((m) => m.options?.tender).filter(Boolean) as DemoTender[];
      const n = kids.length || cl.getAllChildMarkers().length;
      const tone = kids.length ? toneOf(kids) : 'later';
      return L.divIcon({
        html: `<span>${n}</span>`,
        className: `demo-bubble is-cluster tone-${tone}`,
        iconSize: [44, 44],
      });
    },
  });

  for (const t of DEMO_TENDERS) {
    const tone = urgencyTone(t.closeDays);
    const marker = L.marker([t.pin.lat, t.pin.lng], {
      tender: t,
      title: t.title,
      icon: L.divIcon({
        html: `<span>1</span>`,
        className: `demo-bubble is-pin tone-${tone} prec-${t.pin.precision}`,
        iconSize: [30, 30],
      }),
    });
    marker.on('click', () => {
      renderCards([t.id]);
      map.setView([t.pin.lat, t.pin.lng], Math.max(map.getZoom(), 12));
    });
    cluster.addLayer(marker);
  }

  cluster.on('clusterclick', (e: { layer: { getAllChildMarkers: Function } }) => {
    const ids = e.layer.getAllChildMarkers().map((m: { options?: { tender?: DemoTender } }) => m.options?.tender?.id).filter(Boolean);
    renderCards(ids);
  });

  map.addLayer(cluster);

  document.getElementById('demo-clear')?.addEventListener('click', () => {
    renderCards(null);
    map.setView([-28.6, 24.8], 5);
  });
}
