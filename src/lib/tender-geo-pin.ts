import { PLACES, PROVINCE_CENTROIDS, type LocationFields, type Place, type PlacePrecision } from './tender-location';
import { issuerOffice } from './issuer-offices';
import { districtSeat } from './district-seats';

const GPS = /(-2[2-9]\.\d{2,7})\s*[,\s]\s*(1[6-9]|2[0-9]|3[0-3])\.(\d{2,7})/;
const WORK_CUE = /\b(at|in|for|within|site|situated|delivery|deliver|supply to|works?|municipality|ward|hospital|clinic|school|port|dam|campus|depot|village|township)\b/;
const MUNI = /([a-z][a-z .'-]{2,40})\s+(local municipality|municipality|district municipality)/i;
const WORK_PLACES: Place[] = [
  { slug: 'mathibestad', name: 'Mathibestad', province: 'north-west', lat: -25.208, lng: 28.128, precision: 'town' },
  { slug: 'king-shaka', name: 'King Shaka', province: 'kwazulu-natal', lat: -29.614, lng: 31.120, precision: 'town', aliases: ['king shaka'] },
  { slug: 'st-lucia', name: 'St Lucia', province: 'kwazulu-natal', lat: -28.376, lng: 32.412, precision: 'town', aliases: ['isimangaliso'] },
  { slug: 'khayelitsha', name: 'Khayelitsha', province: 'western-cape', lat: -34.040, lng: 18.678, precision: 'town' },
  { slug: 'soweto', name: 'Soweto', province: 'gauteng', lat: -26.268, lng: 27.858, precision: 'town' },
  { slug: 'pretoria', name: 'Pretoria', province: 'gauteng', lat: -25.746, lng: 28.188, precision: 'metro' },
];
const GAZETTEER = [...PLACES, ...WORK_PLACES].sort((a, b) => longest(b) - longest(a));
const NOTES = { gps: 'printed coordinates', work: 'where the work is', briefing: 'briefing venue', office: 'issuing office', district: 'district seat', municipality: 'municipality', province: 'province only' } as const;
export type PinBasis = keyof typeof NOTES;
function longest(p: Place): number { return [p.name, ...(p.aliases ?? [])].reduce((m, s) => Math.max(m, s.length), 0); }
function norm(s: string): string { return s.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim(); }
export type TenderPin = { id: string; lat: number; lng: number; sector: string | null; precision: PlacePrecision | 'gps'; label: string; basis: PinBasis };
export function parseGps(text: string | null | undefined): { lat: number; lng: number } | null {
  if (!text) return null;
  const m = text.match(GPS);
  if (!m) return null;
  const lat = Number(m[1]);
  const lng = Number(`${m[2]}.${m[3]}`);
  if (lat > -22 || lat < -35.5 || lng < 16 || lng > 33) return null;
  return { lat, lng };
}
function hashAngle(id: string): { a: number; u: number } {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  return { a: ((h >>> 0) % 360) * Math.PI / 180, u: ((h >>> 8) % 1000) / 1000 };
}
export function spreadPin(id: string, lat: number, lng: number, precision: string): { lat: number; lng: number } {
  if (precision === 'gps') return { lat, lng };
  const span = precision === 'town' || precision === 'metro' ? 0.012 : precision === 'province' ? 0.08 : 0.14;
  const { a, u } = hashAngle(id);
  const r = (0.2 + u * 0.6) * span;
  return { lat: lat + Math.sin(a) * r, lng: lng + Math.cos(a) * r };
}
function findPlaces(text: string, province?: string | null): Place[] {
  if (!text) return [];
  const padded = ` ${norm(text)} `;
  const hits: Place[] = [];
  const seen = new Set<string>();
  for (const place of GAZETTEER) {
    if (seen.has(place.slug)) continue;
    const names = [place.name, ...(place.aliases ?? [])].map(norm).filter((n) => n.length >= 4);
    if (names.some((n) => padded.includes(` ${n} `))) { hits.push(place); seen.add(place.slug); }
  }
  if (province && province !== 'national') {
    const same = hits.filter((p) => !p.province || p.province === province);
    if (same.length) return same;
  }
  return hits;
}
function pickWorkPlace(title: string, description: string, province?: string | null): Place | null {
  const blob = `${title}\n${description}`;
  const cued = blob.split(/[\n.;]/).map((s) => s.trim()).filter((s) => s.length > 8 && WORK_CUE.test(norm(s)));
  return findPlaces(cued.join(' '), province)[0] || findPlaces(blob, province)[0] || null;
}
export function pinFromTender(row: LocationFields & { id: string; sector?: string | null }): TenderPin | null {
  const province = row.province && PROVINCE_CENTROIDS[row.province] ? row.province : null;
  const workText = [row.title, row.description].filter(Boolean).join('\n');
  const gps = parseGps(workText);
  const work = pickWorkPlace(row.title || '', row.description || '', province);
  const briefing = findPlaces(row.briefing_location || '', province)[0] || null;
  const office = issuerOffice(row.procuring_entity, workText, province);
  const blob = [row.title, row.description, row.procuring_entity, row.briefing_location].filter(Boolean).join(' ');
  const district = districtSeat(blob, province);
  const muni = findPlaces(blob.match(MUNI)?.[1] || '', province)[0] || null;
  let basis: PinBasis = 'province';
  let lat: number | null = null;
  let lng: number | null = null;
  let precision: TenderPin['precision'] = 'unknown';
  let label = '';
  if (gps) { basis = 'gps'; lat = gps.lat; lng = gps.lng; precision = 'gps'; label = work?.name || 'GPS'; }
  else if (work) { basis = 'work'; lat = work.lat; lng = work.lng; precision = work.precision; label = work.name; }
  else if (briefing) { basis = 'briefing'; lat = briefing.lat; lng = briefing.lng; precision = briefing.precision; label = briefing.name; }
  else if (office) { basis = 'office'; lat = office.lat; lng = office.lng; precision = office.precision; label = office.name; }
  else if (district) { basis = 'district'; lat = district.lat; lng = district.lng; precision = 'town'; label = district.name; }
  else if (muni) { basis = 'municipality'; lat = muni.lat; lng = muni.lng; precision = muni.precision; label = muni.name; }
  else if (province) { const c = PROVINCE_CENTROIDS[province]; lat = c.lat; lng = c.lng; precision = province === 'national' ? 'national' : 'province'; label = c.name; }
  else return null;
  const spread = spreadPin(row.id, lat, lng, precision);
  return { id: row.id, lat: spread.lat, lng: spread.lng, sector: row.sector ?? null, precision, label: `${label} \u00b7 ${NOTES[basis]}`, basis };
}
