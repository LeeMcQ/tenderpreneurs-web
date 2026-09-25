import {
  bidNumber,
  closeWeekdayChip,
  displayTitle,
  fmtCloseLong,
  fmtCloseTime,
  fmtUpdatedAgo,
  fmtValue,
  provinceLabel,
  urgency,
  PROVINCE_LABELS,
} from '../lib/tender-display';
import { invalidateTenderMap, renderDensity, renderMap, type GeoPayload } from './tender-map';

let offset = 0, currentTotal = 0, loading = false;
const LIMIT = 20;

const $ = (id: string) => document.getElementById(id)!;
const list = $('tender-list'), statsBar = $('stats-bar'), gateBanner = $('gate-banner');
const loadMoreRow = $('load-more-row') as HTMLElement, loadMoreBtn = $('load-more-btn');
const provinceSel = $('province-filter') as HTMLSelectElement;
const sectorSel = $('sector-filter') as HTMLSelectElement;
const withinSel = $('within-filter') as HTMLSelectElement;
const searchInput = $('search-input') as HTMLInputElement;
const chipsEl = $('chips'), sheet = $('filters-sheet'), toggle = $('filters-toggle'), fcount = $('filters-count');
const liveNote = document.getElementById('live-note');

function esc(s: any): string { const d = document.createElement('div'); d.textContent = s ?? ''; return d.innerHTML; }

function setLiveNote(msg: string | null) {
  if (!liveNote) return;
  if (!msg) {
    liveNote.hidden = true;
    liveNote.textContent = '';
    return;
  }
  liveNote.hidden = false;
  liveNote.innerHTML = msg;
}

function hasCards() {
  return !!list.querySelector('.tender-row');
}

function renderCard(t: any): string {
  const u = urgency(t.closing_date, t.closing_time);
  const cents = t.estimated_value ?? t.value_cents ?? null;
  const heading = displayTitle(t);
  const weekday = closeWeekdayChip(t.closing_date);
  const tags = [
    cents ? `<span class="tag tag-value">${fmtValue(cents)}</span>` : '',
    t.cidb_grade ? `<span class="tag tag-cidb">CIDB ${esc(t.cidb_grade)}</span>` : '',
    weekday ? `<span class="tag tag-deadline ${u.cls}">${esc(weekday)}</span>` : '',
    t.bbbee_required ? `<span class="tag tag-bbbee">B-BBEE L${esc(t.bbbee_required)}</span>` : '',
    t.briefing_compulsory ? `<span class="tag tag-brief">Compulsory briefing</span>` : '',
  ].filter(Boolean).join('');
  const loc = t.location?.label || provinceLabel(t.province);
  const entityBits = [t.procuring_entity, loc].filter(Boolean);
  const entity = entityBits.length ? `<p class="tender-entity">${entityBits.map(esc).join(' · ')}</p>` : '';
  const ref = bidNumber(t);
  const closeDate = fmtCloseLong(t.closing_date);
  const closeTime = fmtCloseTime(t.closing_time);
  const rail = `
    <div class="tr-when">
      ${ref ? `<p class="tr-ref">${esc(ref)}</p>` : ''}
      ${closeDate ? `<p class="tr-close-lbl">Closing</p><p class="tr-close-date">${esc(closeDate)}</p>` : ''}
      ${closeTime ? `<p class="tr-close-time">${esc(closeTime)}</p>` : ''}
    </div>`;
  return `<a href="/tenders/t/${t.id}" class="tender-row">
      ${rail}
      <div class="tr-main">
        <h2 class="tender-title">${esc(heading)}</h2>
        ${entity}
        <div class="tender-tags">${tags}</div>
      </div>
    </a>`;
}

function skeletons(n = 8): string {
  return Array.from({ length: n }, () => `
    <div class="skeleton-card">
      <div class="sk sk-line" style="width:28%"></div>
      <div class="sk sk-line" style="width:78%"></div>
      <div class="sk sk-line" style="width:46%"></div>
    </div>`).join('');
}

let locality = '';
let clusterIds: string[] = [];

function renderChips() {
  const items: string[] = [];
  if (provinceSel.value) items.push(`<span class="chip">${PROVINCE_LABELS[provinceSel.value] ?? provinceSel.value}<button data-clear="province" aria-label="Remove province filter">\u00d7</button></span>`);
  if (locality || clusterIds.length) items.push(`<span class="chip">${esc(locality || 'map cluster')}${clusterIds.length ? ` (${clusterIds.length})` : ''}<button data-clear="locality" aria-label="Remove town filter">\u00d7</button></span>`);
  if (sectorSel.value) items.push(`<span class="chip" style="text-transform:capitalize">${sectorSel.value}<button data-clear="sector" aria-label="Remove sector filter">\u00d7</button></span>`);
  if (withinSel.value) items.push(`<span class="chip">Closes in ${esc(withinSel.value)} days<button data-clear="within" aria-label="Remove closing window">\u00d7</button></span>`);
  if (searchInput.value.trim()) items.push(`<span class="chip">"${esc(searchInput.value.trim())}"<button data-clear="q" aria-label="Clear search">\u00d7</button></span>`);
  chipsEl.innerHTML = items.join('');
  const count = items.length;
  if (fcount) { (fcount as HTMLElement).hidden = count === 0; fcount.textContent = String(count); }
}

function clearFilters() {
  provinceSel.value = '';
  locality = '';
  clusterIds = [];
  sectorSel.value = '';
  withinSel.value = '';
  searchInput.value = '';
  resetAndFetch();
}

async function fetchTenders(append = false) {
  if (loading) return; loading = true;
  const params = new URLSearchParams({ limit: String(LIMIT), offset: String(offset) });
  if (provinceSel.value) params.set('province', provinceSel.value);
  if (clusterIds.length) params.set('ids', clusterIds.slice(0, 40).join(','));
  else if (locality) params.set('locality', locality);
  if (sectorSel.value) params.set('sector', sectorSel.value);
  if (withinSel.value) params.set('within', withinSel.value);
  if (searchInput.value.trim()) params.set('q', searchInput.value.trim());

  if (!append) {
    if (!hasCards()) list.innerHTML = skeletons();
    gateBanner.classList.add('hidden');
    loadMoreRow.style.display = 'none';
  } else {
    loadMoreBtn.textContent = 'Loading\u2026';
    loadMoreBtn.setAttribute('disabled','');
  }

  try {
    const res = await fetch(`/api/tenders/search?${params}`);
    const data = await res.json().catch(() => null);
    if (!res.ok || !data?.ok) {
      const quota = data?.code === 'd1_quota';
      const msg = quota
        ? (data.error || 'Live catalogue hit today\u2019s database read limit. It resets at midnight UTC.')
        : (data?.error || `Tenders could not be loaded (${res.status}).`);
      throw Object.assign(new Error(msg), { quota });
    }
    setLiveNote(null);
    if (!append) list.innerHTML = '';
    currentTotal = data.total ?? 0;

    if ((data.tenders?.length ?? 0) === 0 && !append) {
      list.innerHTML = `<div class="empty-state">No open tenders match those filters.<br><button type="button" id="clear-filters">Clear filters</button></div>`;
      statsBar.textContent = 'No results';
      $('clear-filters')?.addEventListener('click', clearFilters);
    } else {
      data.tenders?.forEach((t: any) => list.insertAdjacentHTML('beforeend', renderCard(t)));
      const newest = data.tenders?.reduce((acc: string | null, row: any) => {
        const seen = row.last_seen_at || row.first_seen_at;
        return !acc || (seen && seen > acc) ? seen : acc;
      }, null);
      const ago = fmtUpdatedAgo(newest);
      statsBar.innerHTML = `<span>${currentTotal.toLocaleString()} open \u00b7 closes soonest</span>${ago ? `<span class="stats-updated">${esc(ago)}</span>` : ''}`;
    }

    if (data.gated) { gateBanner.classList.remove('hidden'); loadMoreRow.style.display = 'none'; }
    else {
      gateBanner.classList.add('hidden');
      const shown = list.querySelectorAll('.tender-row').length;
      if (shown < currentTotal) { loadMoreRow.style.display = 'block'; loadMoreBtn.textContent = 'Load more tenders'; loadMoreBtn.removeAttribute('disabled'); offset += LIMIT; }
      else loadMoreRow.style.display = 'none';
    }
  } catch (err) {
    const quota = !!(err as any)?.quota;
    const msg = (err as Error)?.message || 'Tenders could not be loaded.';
    setLiveNote(quota
      ? `${esc(msg)} The cards below stay on screen. <a href="/tenders/map-demo">See how the map clusters work</a>.`
      : esc(msg));
    if (hasCards()) {
      statsBar.textContent = quota ? 'Showing the last good page.' : msg;
    } else if (!append) {
      list.innerHTML = `<div class="error-state">${esc(msg)}</div>`;
    }
    console.error('[tenders] fetch error:', err);
  } finally { loading = false; }
  if (!clusterIds.length) void refreshMap();
}

function resetAndFetch() { offset = 0; renderChips(); fetchTenders(false); }

let debounce: ReturnType<typeof setTimeout>;
searchInput.addEventListener('input', () => { clearTimeout(debounce); debounce = setTimeout(resetAndFetch, 300); });
$('search-btn').addEventListener('click', resetAndFetch);
$('sheet-apply').addEventListener('click', () => { sheet.classList.remove('open'); toggle.setAttribute('aria-expanded','false'); resetAndFetch(); });
provinceSel.addEventListener('change', resetAndFetch);
sectorSel.addEventListener('change', resetAndFetch);
withinSel.addEventListener('change', resetAndFetch);
searchInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') resetAndFetch(); });
loadMoreBtn.addEventListener('click', () => fetchTenders(true));

toggle.addEventListener('click', () => {
  const open = sheet.classList.toggle('open');
  toggle.setAttribute('aria-expanded', String(open));
});

chipsEl.addEventListener('click', (e) => {
  const btn = (e.target as HTMLElement).closest('button[data-clear]') as HTMLElement | null;
  if (!btn) return;
  const what = btn.getAttribute('data-clear');
  if (what === 'province') provinceSel.value = '';
  else if (what === 'locality') { locality = ''; clusterIds = []; }
  else if (what === 'sector') sectorSel.value = '';
  else if (what === 'within') withinSel.value = '';
  else if (what === 'q') searchInput.value = '';
  resetAndFetch();
});

const mapEl = document.getElementById('tender-map');
const densEl = document.getElementById('province-density');
const mapToggle = document.getElementById('map-toggle');
let geoCache: GeoPayload | null = null;
let themeCache: Array<{ slug: string; count: number }> = [];

function paintMapPaused(reason: string) {
  if (!mapEl) return;
  mapEl.innerHTML = `<div class="osm-shell map-paused">
    <div class="map-head">
      <div>
        <h2>Map paused</h2>
        <p>${esc(reason)}</p>
      </div>
    </div>
    <p class="map-demo-cta">The live catalogue map will return when the daily database limit resets. Meanwhile you can open the 20-pin cluster demo — same bubbles, same split-on-zoom, same sector pins.</p>
    <a class="btn-primary" href="/tenders/map-demo">See how clusters work</a>
  </div>`;
}

async function refreshMap() {
  if (!mapEl && !densEl) return;
  const params = new URLSearchParams();
  if (sectorSel.value) params.set('sector', sectorSel.value);
  if (searchInput.value.trim()) params.set('q', searchInput.value.trim());
  try {
    const res = await fetch(`/api/tenders/geo?${params}`);
    if (!res.ok) {
      const errBody = await res.json().catch(() => null);
      paintMapPaused(errBody?.code === 'd1_quota'
        ? 'Daily database read limit reached. It resets at midnight UTC.'
        : 'Map data could not be loaded.');
      return;
    }
    geoCache = await res.json();
    if (!sectorSel.value && geoCache.themes?.length) themeCache = geoCache.themes;
    else if (themeCache.length && geoCache) geoCache.themes = themeCache;
  } catch {
    paintMapPaused('Map data could not be loaded.');
    return;
  }
  if (!geoCache) return;
  if (densEl) {
    renderDensity(densEl, geoCache, provinceSel.value);
    densEl.querySelectorAll<HTMLButtonElement>('[data-province]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const slug = btn.getAttribute('data-province') || '';
        provinceSel.value = provinceSel.value === slug ? '' : slug;
        clusterIds = [];
        resetAndFetch();
      });
    });
  }
  if (mapEl) {
    void renderMap(
      mapEl,
      geoCache,
      provinceSel.value,
      sectorSel.value,
      (slug) => { provinceSel.value = slug; locality = ''; clusterIds = []; resetAndFetch(); },
      (name, ids) => { locality = name; clusterIds = ids && ids.length ? ids : []; resetAndFetch(); },
      (theme) => { sectorSel.value = theme; clusterIds = []; resetAndFetch(); },
    );
  }
}

mapToggle?.addEventListener('click', () => {
  const panel = document.getElementById('map-panel');
  if (!panel) return;
  const open = panel.classList.toggle('is-open');
  mapToggle.setAttribute('aria-expanded', String(open));
  mapToggle.textContent = open ? 'Hide map' : 'Show map';
  if (open) invalidateTenderMap();
});

if (mapToggle && window.innerWidth < 980) {
  const panel = document.getElementById('map-panel');
  if (panel && !panel.classList.contains('is-open')) {
    panel.classList.add('is-open');
    mapToggle.setAttribute('aria-expanded', 'true');
    mapToggle.textContent = 'Hide map';
  }
}

const ssr = list.getAttribute('data-ssr') === '1';
const ssrCount = parseInt(list.getAttribute('data-count') ?? '0', 10) || 0;
if (ssr) {
  offset = ssrCount;
  currentTotal = ssrCount;
  if (!gateBanner.classList.contains('hidden')) loadMoreRow.style.display = 'none';
  else loadMoreRow.style.display = 'block';
  void refreshMap();
} else {
  fetchTenders(false);
}
