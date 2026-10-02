import { PLACES, PROVINCE_CENTROIDS, type LocationFields, type Place, type PlacePrecision } from './tender-location';

const GPS = /(-2[2-9]\.\d{2,7})\s*[,\s]\s*(1[6-9]|2[0-9]|3[0-3])\.(\d{2,7})/;
const WORK_CUE = /\b(at|in|for|within|site|situated|delivery|deliver|supply to|works?|municipality|ward|hospital|clinic|school|port|dam|campus|depot|village|township)\b/;

/** Places named on notices that the core gazetteer folds into a metro or misses. */
const WORK_PLACES: Place[] = [
  { slug: 'st-lucia', name: 'St Lucia', province: 'kwazulu-natal', lat: -28.376, lng: 32.412, precision: 'town', aliases: ['isimangaliso', 'i simangaliso'] },
  { slug: 'hermanus', name: 'Hermanus', province: 'western-cape', lat: -34.419, lng: 19.243, precision: 'town', aliases: ['overstrand'] },
  { slug: 'malmesbury', name: 'Malmesbury', province: 'western-cape', lat: -33.461, lng: 18.727, precision: 'town', aliases: ['swartland'] },
  { slug: 'wellington', name: 'Wellington', province: 'western-cape', lat: -33.640, lng: 19.010, precision: 'town' },
  { slug: 'caledon', name: 'Caledon', province: 'western-cape', lat: -34.230, lng: 19.428, precision: 'town', aliases: ['theewaterskloof'] },
  { slug: 'ceres', name: 'Ceres', province: 'western-cape', lat: -33.369, lng: 19.311, precision: 'town', aliases: ['witzenberg'] },
  { slug: 'vredendal', name: 'Vredendal', province: 'western-cape', lat: -31.668, lng: 18.501, precision: 'town', aliases: ['matzikama'] },
  { slug: 'khayelitsha', name: 'Khayelitsha', province: 'western-cape', lat: -34.040, lng: 18.678, precision: 'town' },
  { slug: 'mitchells-plain', name: 'Mitchells Plain', province: 'western-cape', lat: -34.051, lng: 18.622, precision: 'town' },
  { slug: 'bellville', name: 'Bellville', province: 'western-cape', lat: -33.901, lng: 18.629, precision: 'town' },
  { slug: 'ngqura', name: 'Ngqura', province: 'eastern-cape', lat: -33.805, lng: 25.686, precision: 'town', aliases: ['coega', 'port of ngqura'] },
  { slug: 'graaff-reinet', name: 'Graaff-Reinet', province: 'eastern-cape', lat: -32.252, lng: 24.541, precision: 'town', aliases: ['dr beylers naude'] },
  { slug: 'cradock', name: 'Cradock', province: 'eastern-cape', lat: -32.164, lng: 25.619, precision: 'town', aliases: ['nxuba', 'inxuba yethemba'] },
  { slug: 'aliwal', name: 'Aliwal North', province: 'eastern-cape', lat: -30.694, lng: 26.711, precision: 'town', aliases: ['maletswai'] },
  { slug: 'queenstown-town', name: 'Komani', province: 'eastern-cape', lat: -31.897, lng: 26.875, precision: 'town', aliases: ['enocht mgijima'] },
  { slug: 'kathu', name: 'Kathu', province: 'northern-cape', lat: -27.696, lng: 23.049, precision: 'town', aliases: ['gamagara'] },
  { slug: 'postmasburg', name: 'Postmasburg', province: 'northern-cape', lat: -28.329, lng: 23.066, precision: 'town', aliases: ['tsantsabane'] },
  { slug: 'sasolburg', name: 'Sasolburg', province: 'free-state', lat: -26.814, lng: 27.829, precision: 'town', aliases: ['metsimaholo'] },
  { slug: 'harrismith', name: 'Harrismith', province: 'free-state', lat: -28.272, lng: 29.130, precision: 'town', aliases: ['maluti a phofung'] },
  { slug: 'phuthaditjhaba', name: 'Phuthaditjhaba', province: 'free-state', lat: -28.524, lng: 28.816, precision: 'town' },
  { slug: 'ulundi', name: 'Ulundi', province: 'kwazulu-natal', lat: -28.335, lng: 31.416, precision: 'town' },
  { slug: 'vryheid', name: 'Vryheid', province: 'kwazulu-natal', lat: -27.769, lng: 30.791, precision: 'town', aliases: ['abaqulusi'] },
  { slug: 'kokstad', name: 'Kokstad', province: 'kwazulu-natal', lat: -30.547, lng: 29.424, precision: 'town', aliases: ['greater kokstad'] },
  { slug: 'howick', name: 'Howick', province: 'kwazulu-natal', lat: -29.477, lng: 30.231, precision: 'town', aliases: ['umngeni'] },
  { slug: 'mandeni', name: 'Mandeni', province: 'kwazulu-natal', lat: -29.148, lng: 31.408, precision: 'town', aliases: ['sundumbili'] },
  { slug: 'soweto', name: 'Soweto', province: 'gauteng', lat: -26.268, lng: 27.858, precision: 'town' },
  { slug: 'sandton', name: 'Sandton', province: 'gauteng', lat: -26.107, lng: 28.056, precision: 'town' },
  { slug: 'midrand', name: 'Midrand', province: 'gauteng', lat: -25.989, lng: 28.127, precision: 'town' },
  { slug: 'centurion', name: 'Centurion', province: 'gauteng', lat: -25.860, lng: 28.189, precision: 'town' },
  { slug: 'kempton', name: 'Kempton Park', province: 'gauteng', lat: -26.101, lng: 28.230, precision: 'town' },
  { slug: 'ortambo', name: 'OR Tambo', province: 'gauteng', lat: -26.136, lng: 28.241, precision: 'town', aliases: ['or tambo airport', 'o r tambo'] },
  { slug: 'standerton', name: 'Standerton', province: 'mpumalanga', lat: -26.944, lng: 29.241, precision: 'town', aliases: ['lekw a'] },
  { slug: 'barberton', name: 'Barberton', province: 'mpumalanga', lat: -25.788, lng: 31.053, precision: 'town', aliases: ['umjindi'] },
  { slug: 'white-river', name: 'White River', province: 'mpumalanga', lat: -25.332, lng: 31.012, precision: 'town' },
  { slug: 'giyani', name: 'Giyani', province: 'limpopo', lat: -23.302, lng: 30.718, precision: 'town', aliases: ['greater giyani'] },
  { slug: 'musina', name: 'Musina', province: 'limpopo', lat: -22.338, lng: 30.041, precision: 'town', aliases: ['messina'] },
  { slug: 'modimolle', name: 'Modimolle', province: 'limpopo', lat: -24.700, lng: 28.406, precision: 'town', aliases: ['nylstroom'] },
  { slug: 'phalaborwa', name: 'Phalaborwa', province: 'limpopo', lat: -23.943, lng: 31.141, precision: 'town', aliases: ['ba phalaborwa'] },
  { slug: 'lichtenburg', name: 'Lichtenburg', province: 'north-west', lat: -26.152, lng: 26.160, precision: 'town', aliases: ['ditsobotla'] },
  { slug: 'brits', name: 'Brits', province: 'north-west', lat: -25.634, lng: 27.781, precision: 'town', aliases: ['madibeng'] },
  { slug: 'vryburg', name: 'Vryburg', province: 'north-west', lat: -26.957, lng: 24.730, precision: 'town', aliases: ['naledi'] },
];

const GAZETTEER = [...PLACES, ...WORK_PLACES].sort((a, b) => longest(b) - longest(a));

function longest(p: Place): number {
  return [p.name, ...(p.aliases ?? [])].reduce((m, s) => Math.max(m, s.length), 0);
}

function norm(s: string): string {
  return s.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
}

export type TenderPin = {
  id: string;
  lat: number;
  lng: number;
  sector: string | null;
  precision: PlacePrecision | 'gps';
  label: string;
  basis: 'work' | 'office' | 'province';
};

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
  if (precision === 'gps' || precision === 'street') return { lat, lng };
  const span = precision === 'town' || precision === 'metro' ? 0.012 : precision === 'province' ? 0.08 : 0.14;
  const { a, u } = hashAngle(id);
  const r = (0.2 + u * 0.6) * span;
  return { lat: lat + Math.sin(a) * r, lng: lng + Math.cos(a) * r };
}

function namesOf(p: Place): string[] {
  return [p.name, ...(p.aliases ?? [])].map(norm).filter((n) => n.length >= 4);
}

function findPlaces(text: string, province?: string | null): Place[] {
  if (!text) return [];
  const padded = ` ${norm(text)} `;
  const hits: Place[] = [];
  const seen = new Set<string>();
  for (const place of GAZETTEER) {
    if (seen.has(place.slug)) continue;
    if (namesOf(place).some((n) => padded.includes(` ${n} `))) {
      hits.push(place);
      seen.add(place.slug);
    }
  }
  if (province && province !== 'national') {
    const same = hits.filter((p) => !p.province || p.province === province);
    if (same.length) return same;
  }
  return hits;
}

function workSentences(text: string): string[] {
  return text.split(/[\n.;]/).map((s) => s.trim()).filter((s) => s.length > 8);
}

function pickWorkPlace(title: string, description: string, province?: string | null): Place | null {
  const blob = `${title}\n${description}`;
  const cued = workSentences(blob).filter((s) => WORK_CUE.test(norm(s)));
  const fromCue = findPlaces(cued.join(' '), province);
  if (fromCue.length) return fromCue[0];
  const fromAll = findPlaces(blob, province);
  return fromAll[0] ?? null;
}

export function pinFromTender(row: LocationFields & { id: string; sector?: string | null }): TenderPin | null {
  const workText = [row.title, row.description].filter(Boolean).join('\n');
  const gps = parseGps(workText);
  const province = row.province && PROVINCE_CENTROIDS[row.province] ? row.province : null;
  const work = pickWorkPlace(row.title || '', row.description || '', province);
  const office = !work ? (findPlaces(row.briefing_location || '', province)[0] || findPlaces(row.procuring_entity || '', province)[0]) : null;
  const place = work || office;
  const basis: TenderPin['basis'] = work || gps ? 'work' : office ? 'office' : 'province';

  let lat = gps?.lat ?? place?.lat ?? null;
  let lng = gps?.lng ?? place?.lng ?? null;
  let precision: TenderPin['precision'] = gps ? 'gps' : place?.precision ?? 'unknown';
  let label = place?.name ?? '';

  if (lat == null || lng == null) {
    if (!province) return null;
    const c = PROVINCE_CENTROIDS[province];
    lat = c.lat;
    lng = c.lng;
    precision = province === 'national' ? 'national' : 'province';
    label = c.name;
  }

  const spread = spreadPin(row.id, lat, lng, precision);
  const note = basis === 'work' ? 'where the work is' : basis === 'office' ? 'issuing office' : 'province only';
  return {
    id: row.id,
    lat: spread.lat,
    lng: spread.lng,
    sector: row.sector ?? null,
    precision,
    label: label ? `${label} \u00b7 ${note}` : note,
    basis,
  };
}
