import {
  displayTitle,
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

function esc(s: any): string { const d = document.createElement('div'); d.textContent = s ?? ''; return d.innerHTML; }

function renderCard(t: any): string {
  const u = urgency(t.closing_date, t.closing_time);
  const cents = t.estimated_value ?? t.value_cents ?? null;
  const heading = displayTitle(t);
  const tags = [
    `<span class="tag tag-deadline ${u.cls}">${esc(u.text)}</span>`,
    cents ? `<span class="tag tag-value">${fmtValue(cents)}</span>` : '',
    t.cidb_grade ? `<span class="tag tag-cidb">CIDB ${esc(t.cidb_grade)}</span>` : '',
    t.briefing_compulsory ? `<span class="tag tag-brief">Compulsory briefing</span>` : '',
    t.bbbee_required ? `<span class="tag tag-bbbee">B-BBEE L${esc(t.bbbee_required)}</span>` : '',
    t.sector ? `<span class="tag tag-sector">${esc(t.sector)}</span>` : '',
  ].filter(Boolean).join('');
  const locLabel = t.location?.label || [t.procuring_entity, provinceLabel(t.province)].filter(Boolean).join(' \u00b7 ');
  const entity = [t.procuring_entity].filter(Boolean).map(esc).join('');
  const place = locLabel ? `<p class="tender-place">${esc(locLabel)}</p>` : '';
  const ref = t.source_ref ? `<p class="tr-ref">${esc(t.source_ref)}</p>` : '';
  return `<a href="/tenders/t/${t.id}" class="tender-row">
      <div class="tr-main">
        ${ref}
        <h2 class="tender-title">${esc(heading)}</h2>
        ${entity ? `<p class="tender-entity">${entity}</p>` : ''}
        ${place}
        <div class="tender-tags">${tags}</div>
      </div>
      <span class="tr-close ${u.cls}">${esc(u.text)}</span>
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

function renderChips() {
  const items: string[] = [];
  if (provinceSel.value) items.push(`<span class="chip">${PROVINCE_LABELS[provinceSel.value] ?? provinceSel.value}<button data-clear="province" aria-label="Remove province filter">\u00d7</button></span>`);
  if (locality) items.push(`<span class="chip">${esc(locality)}<button data-clear="locality" aria-label="Remove town filter">\u00d7</button></span>`);
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
  sectorSel.value = '';
  withinSel.value = '';
  searchInput.value = '';
  resetAndFetch();
}

async function fetchTenders(append = false) {
  if (loading) return; loading = true;
  const params = new URLSearchParams({ limit: String(LIMIT), offset: String(offset) });
  if (provinceSel.value) params.set('province', provinceSel.value);
  if (locality) params.set('locality', locality);
  if (sectorSel.value) params.set('sector', sectorSel.value);
  if (withinSel.value) params.set('within', withinSel.value);
  if (searchInput.value.trim()) params.set('q', searchInput.value.trim());

  if (!append) { list.innerHTML = skeletons(); statsBar.textContent = ''; gateBanner.classList.add('hidden'); loadMoreRow.style.display = 'none'; }
  else { loadMoreBtn.textContent = 'Loading\u2026'; loadMoreBtn.setAttribute('disabled',''); }

  try {
    const res = await fetch(`/api/tenders/search?${params}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (!append) list.innerHTML = '';
    currentTotal = data.total ?? 0;

    if ((data.tenders?.length ?? 0) === 0 && !append) {
      list.innerHTML = `<div class="empty-state">No open tenders match those filters.<br><button type="button" id="clear-filters">Clear filters</button></div>`;
      statsBar.textContent = 'No results';
      $('clear-filters')?.addEventListener('click', clearFilters);
    } else {
      data.tenders?.forEach((t: any) => list.insertAdjacentHTML('beforeend', renderCard(t)));
      const showing = list.querySelectorAll('.tender-row').length;
      statsBar.textContent = `Showing ${showing} of ${currentTotal.toLocaleString()} open tenders \u00b7 closing soonest`;
    }

    if (data.gated) { gateBanner.classList.remove('hidden'); loadMoreRow.style.display = 'none'; }
    else {
      gateBanner.classList.add('hidden');
      const shown = list.querySelectorAll('.tender-row').length;
      if (shown < currentTotal) { loadMoreRow.style.display = 'block'; loadMoreBtn.textContent = 'Load more tenders'; loadMoreBtn.removeAttribute('disabled'); offset += LIMIT; }
      else loadMoreRow.style.display = 'none';
    }
  } catch (err) {
    if (!append) list.innerHTML = `<div class="error-state">Tenders could not be loaded. Check the connection and try again.</div>`;
    console.error('[tenders] fetch error:', err);
  } finally { loading = false; }
  void refreshMap();
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
  else if (what === 'locality') locality = '';
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

async function refreshMap() {
  if (!mapEl && !densEl) return;
  const params = new URLSearchParams();
  if (sectorSel.value) params.set('sector', sectorSel.value);
  if (searchInput.value.trim()) params.set('q', searchInput.value.trim());
  try {
    const res = await fetch(`/api/tenders/geo?${params}`);
    if (!res.ok) throw new Error(String(res.status));
    geoCache = await res.json();
    if (!sectorSel.value && geoCache.themes?.length) themeCache = geoCache.themes;
    else if (themeCache.length && geoCache) geoCache.themes = themeCache;
  } catch {
    return;
  }
  if (!geoCache) return;
  if (densEl) {
    renderDensity(densEl, geoCache, provinceSel.value);
    densEl.querySelectorAll<HTMLButtonElement>('[data-province]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const slug = btn.getAttribute('data-province') || '';
        provinceSel.value = provinceSel.value === slug ? '' : slug;
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
      (slug) => { provinceSel.value = slug; locality = ''; resetAndFetch(); },
      (name) => { locality = name; resetAndFetch(); },
      (theme) => { sectorSel.value = theme; resetAndFetch(); },
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
