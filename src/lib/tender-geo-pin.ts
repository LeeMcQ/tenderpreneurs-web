import { PLACES, PROVINCE_CENTROIDS, type LocationFields, type Place, type PlacePrecision } from './tender-location';
import { issuerOffice } from './issuer-offices';
import { districtSeat } from './district-seats';

/** Pin order. First layer that can place the pin wins. Later layers confirm only.
 *  1 gps  2 named work site  3 briefing  4 issuer office
 *  5 district  6 municipality  7 contact area  8 province only
 */
const GPS = /(-2[2-9]\.\d{2,7})\s*[,\s]\s*(1[6-9]|2[0-9]|3[0-3])\.(\d{2,7})/;
const WORK_CUE = /\b(at|in|to|from|between|site|situated|delivery|deliver|supply to|municipality|ward|hospital|clinic|school|port|dam|campus|depot|village|township|power station|plant|substation|mine)\b/;
const FALSE_CUE = /\bat works\b|\bto supply\b|\bto deliver\b/;
const NATIONWIDE = /\b(various sites|all regions|nationwide|all provinces|panel of)\b/;
const MUNI = /([a-z][a-z .'-]{2,40})\s+(local municipality|municipality|district municipality)/i;
const FROM_TO = /\bfrom\s+([a-z][a-z .'-]{2,40}?)\s+to\s+([a-z][a-z .'-]{2,48})/i;
const PLANTS: Place[] = [
  { slug: 'koeberg', name: 'Koeberg', province: 'western-cape', lat: -33.676, lng: 18.432, precision: 'town', aliases: ['koeberg op', 'koeberg power'] },
  { slug: 'kendal-ps', name: 'Kendal Power Station', province: 'mpumalanga', lat: -26.089, lng: 28.968, precision: 'town', aliases: ['kendal'] },
  { slug: 'medupi', name: 'Medupi', province: 'limpopo', lat: -23.704, lng: 27.563, precision: 'town', aliases: ['medupi power'] },
  { slug: 'kusile', name: 'Kusile', province: 'mpumalanga', lat: -25.919, lng: 28.915, precision: 'town', aliases: ['kusile power'] },
  { slug: 'vanderkloof', name: 'Vanderkloof', province: 'northern-cape', lat: -29.993, lng: 24.731, precision: 'town' },
  { slug: 'bronkhorstspruit', name: 'Bronkhorstspruit', province: 'gauteng', lat: -25.810, lng: 28.746, precision: 'town' },
  { slug: 'matimba', name: 'Matimba', province: 'limpopo', lat: -23.668, lng: 27.613, precision: 'town' },
  { slug: 'lethabo', name: 'Lethabo', province: 'free-state', lat: -26.740, lng: 27.975, precision: 'town' },
  { slug: 'majuba', name: 'Majuba', province: 'mpumalanga', lat: -27.100, lng: 29.770, precision: 'town' },
  { slug: 'tutuka', name: 'Tutuka', province: 'mpumalanga', lat: -26.776, lng: 29.352, precision: 'town' },
  { slug: 'duvha', name: 'Duvha', province: 'mpumalanga', lat: -25.960, lng: 29.340, precision: 'town' },
  { slug: 'matla', name: 'Matla', province: 'mpumalanga', lat: -26.283, lng: 29.133, precision: 'town' },
  { slug: 'kriel-ps', name: 'Kriel Power Station', province: 'mpumalanga', lat: -26.254, lng: 29.180, precision: 'town', aliases: ['kriel power'] },
  { slug: 'camden-ps', name: 'Camden Power Station', province: 'mpumalanga', lat: -26.620, lng: 30.091, precision: 'town', aliases: ['camden power'] },
];
const AREAS: Array<[string, string, number, number]> = [
  ['021', 'Cape Town', -33.926, 18.423], ['011', 'Johannesburg', -26.204, 28.047], ['012', 'Pretoria', -25.746, 28.188],
  ['031', 'Durban', -29.858, 31.021], ['041', 'Gqeberha', -33.961, 25.602], ['051', 'Bloemfontein', -29.118, 26.225],
  ['053', 'Kimberley', -28.738, 24.764], ['043', 'East London', -33.015, 27.911], ['033', 'Pietermaritzburg', -29.601, 30.379],
  ['015', 'Polokwane', -23.905, 29.469], ['013', 'Mbombela', -25.475, 30.969], ['018', 'Mahikeng', -25.865, 25.644],
  ['044', 'George', -33.963, 22.462],
];
const GAZETTEER = [...PLANTS, ...PLACES].sort((a, b) => longest(b) - longest(a));
const NOTES = { gps: 'printed coordinates', work: 'where the work is', briefing: 'briefing venue', office: 'issuing office', district: 'district seat', municipality: 'municipality', contact: 'contact area', province: 'province only' } as const;
export type PinBasis = keyof typeof NOTES;
export type TenderPin = { id: string; lat: number; lng: number; sector: string | null; precision: PlacePrecision | 'gps'; label: string; basis: PinBasis; note?: string };
function longest(p: Place): number { return [p.name, ...(p.aliases ?? [])].reduce((m, s) => Math.max(m, s.length), 0); }
function norm(s: string): string { return s.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/&nbsp;/g, ' ').replace(/[^a-z0-9]+/g, ' ').trim(); }
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
function findPlaces(text: string): Place[] {
  if (!text) return [];
  const padded = ` ${norm(text)} `;
  const hits: Place[] = [];
  const seen = new Set<string>();
  for (const place of GAZETTEER) {
    if (seen.has(place.slug)) continue;
    const names = [place.name, ...(place.aliases ?? [])].map(norm).filter((n) => n.length >= 4);
    if (names.some((n) => padded.includes(` ${n} `))) { hits.push(place); seen.add(place.slug); }
  }
  return hits;
}
function pickWorkPlaces(title: string, description: string): { places: Place[]; unresolved: boolean } {
  const titleNorm = norm(title);
  if (NATIONWIDE.test(titleNorm)) return { places: [], unresolved: false };
  const route = title.match(FROM_TO);
  const dest = route ? findPlaces(route[2]) : [];
  const cued = `${title}\n${description}`.split(/[\n.;]/).map((s) => s.trim()).filter((s) => s.length > 8 && WORK_CUE.test(norm(s)) && !FALSE_CUE.test(norm(s)));
  const fromCue = findPlaces(cued.join(' '));
  const fromAll = findPlaces(`${title}\n${description}`);
  const places = [...dest, ...fromCue, ...fromAll].filter((p, i, arr) => arr.findIndex((x) => x.slug === p.slug) === i).slice(0, 2);
  const namedSite = /\b(power station|substation|mine)\b/.test(titleNorm) || /\bat [a-z]{4,}/.test(titleNorm);
  return { places, unresolved: namedSite && places.length === 0 };
}
function contactArea(phone: string | null | undefined): { name: string; lat: number; lng: number } | null {
  const digits = String(phone || '').replace(/\D/g, '');
  const local = digits.startsWith('27') ? `0${digits.slice(2)}` : digits;
  if (!local.startsWith('0') || /^0[6-8]/.test(local)) return null;
  const hit = AREAS.find(([code]) => local.startsWith(code));
  return hit ? { name: hit[1], lat: hit[2], lng: hit[3] } : null;
}
function placed(rowId: string, sector: string | null, basis: PinBasis, name: string, lat: number, lng: number, precision: TenderPin['precision'], note?: string): TenderPin {
  const spread = spreadPin(rowId + name, lat, lng, precision);
  return { id: rowId, lat: spread.lat, lng: spread.lng, sector, precision, label: `${name} \u00b7 ${NOTES[basis]}`, basis, note };
}
export function pinsFromTender(row: LocationFields & { id: string; sector?: string | null; contact_phone?: string | null }): TenderPin[] {
  const province = row.province && PROVINCE_CENTROIDS[row.province] ? row.province : null;
  const workText = [row.title, row.description].filter(Boolean).join('\n');
  const gps = parseGps(workText);
  const work = pickWorkPlaces(row.title || '', row.description || '');
  const briefing = findPlaces(row.briefing_location || '')[0] || null;
  const office = work.unresolved ? null : issuerOffice(row.procuring_entity, row.briefing_location || '', province);
  const blob = [row.title, row.description, row.procuring_entity, row.briefing_location].filter(Boolean).join(' ');
  const district = districtSeat(blob, province);
  const muni = findPlaces(blob.match(MUNI)?.[1] || '')[0] || null;
  const contact = contactArea(row.contact_phone);
  const sector = row.sector ?? null;
  const officeNote = office && work.places[0]?.province && office && work.places[0].province !== province ? `buyer province ${province} disagrees with ${work.places[0].name}` : undefined;
  if (gps) return [placed(row.id, sector, 'gps', work.places[0]?.name || 'GPS', gps.lat, gps.lng, 'gps', work.places[0] ? undefined : undefined)];
  if (work.places.length) {
    return work.places.map((p) => placed(row.id, sector, 'work', p.name, p.lat, p.lng, p.precision, office && p.province && province && p.province !== province ? `site is not the ${office.name} office` : undefined));
  }
  if (work.unresolved) return [placed(row.id, sector, 'province', province ? PROVINCE_CENTROIDS[province].name : 'Unplaced', province ? PROVINCE_CENTROIDS[province].lat : -28.5, province ? PROVINCE_CENTROIDS[province].lng : 24.7, 'province', 'named site has no coordinate')];
  if (briefing) return [placed(row.id, sector, 'briefing', briefing.name, briefing.lat, briefing.lng, briefing.precision)];
  if (office) return [placed(row.id, sector, 'office', office.name, office.lat, office.lng, office.precision, officeNote)];
  if (district) return [placed(row.id, sector, 'district', district.name, district.lat, district.lng, 'town')];
  if (muni) return [placed(row.id, sector, 'municipality', muni.name, muni.lat, muni.lng, muni.precision)];
  if (contact) return [placed(row.id, sector, 'contact', contact.name, contact.lat, contact.lng, 'town')];
  if (province) { const c = PROVINCE_CENTROIDS[province]; return [placed(row.id, sector, 'province', c.name, c.lat, c.lng, province === 'national' ? 'national' : 'province')]; }
  return [];
}
export function pinFromTender(row: LocationFields & { id: string; sector?: string | null; contact_phone?: string | null }): TenderPin | null {
  return pinsFromTender(row)[0] ?? null;
}
