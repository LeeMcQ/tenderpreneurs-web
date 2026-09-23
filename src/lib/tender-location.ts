/** Resolve a tender to the finest place the public record actually names. */

export type PlacePrecision = 'town' | 'metro' | 'province' | 'national' | 'unknown';

export type Place = {
  slug: string;
  name: string;
  province: string | null;
  lat: number;
  lng: number;
  precision: PlacePrecision;
  aliases?: string[];
};

export const PROVINCE_CENTROIDS: Record<string, { name: string; lat: number; lng: number }> = {
  'western-cape': { name: 'Western Cape', lat: -33.23, lng: 20.54 },
  'eastern-cape': { name: 'Eastern Cape', lat: -32.30, lng: 26.42 },
  'northern-cape': { name: 'Northern Cape', lat: -29.05, lng: 21.85 },
  'free-state': { name: 'Free State', lat: -28.45, lng: 26.80 },
  'kwazulu-natal': { name: 'KwaZulu-Natal', lat: -28.70, lng: 30.90 },
  gauteng: { name: 'Gauteng', lat: -26.27, lng: 28.11 },
  mpumalanga: { name: 'Mpumalanga', lat: -25.57, lng: 30.53 },
  limpopo: { name: 'Limpopo', lat: -23.90, lng: 29.45 },
  'north-west': { name: 'North West', lat: -26.15, lng: 25.40 },
  national: { name: 'National', lat: -25.75, lng: 28.22 },
};

/** Metros and towns we can pin without inventing a street address. */
export const PLACES: Place[] = [
  { slug: 'cape-town', name: 'Cape Town', province: 'western-cape', lat: -33.925, lng: 18.424, precision: 'metro', aliases: ['city of cape town', 'kaapstad', 'bellville', 'parow', 'khayelitsha', 'mitchells plain', 'atlantis'] },
  { slug: 'stellenbosch', name: 'Stellenbosch', province: 'western-cape', lat: -33.935, lng: 18.860, precision: 'town' },
  { slug: 'paarl', name: 'Paarl', province: 'western-cape', lat: -33.734, lng: 18.975, precision: 'town', aliases: ['drakenstein'] },
  { slug: 'worcester', name: 'Worcester', province: 'western-cape', lat: -33.646, lng: 19.449, precision: 'town', aliases: ['breedekloof'] },
  { slug: 'george', name: 'George', province: 'western-cape', lat: -33.963, lng: 22.462, precision: 'town' },
  { slug: 'mossel-bay', name: 'Mossel Bay', province: 'western-cape', lat: -34.183, lng: 22.146, precision: 'town', aliases: ['mosselbaai'] },
  { slug: 'knysna', name: 'Knysna', province: 'western-cape', lat: -34.036, lng: 23.049, precision: 'town' },
  { slug: 'oudtshoorn', name: 'Oudtshoorn', province: 'western-cape', lat: -33.590, lng: 22.203, precision: 'town' },
  { slug: 'saldanha', name: 'Saldanha Bay', province: 'western-cape', lat: -33.012, lng: 17.944, precision: 'town', aliases: ['vredenburg', 'saldanha'] },
  { slug: 'beaufort-west', name: 'Beaufort West', province: 'western-cape', lat: -32.357, lng: 22.583, precision: 'town' },
  { slug: 'gqeberha', name: 'Gqeberha', province: 'eastern-cape', lat: -33.961, lng: 25.615, precision: 'metro', aliases: ['port elizabeth', 'nelson mandela bay', 'pe ', 'uitenhage', 'kariega'] },
  { slug: 'east-london', name: 'East London', province: 'eastern-cape', lat: -33.029, lng: 27.855, precision: 'metro', aliases: ['buffalo city', 'mdantsane', 'king williams town', 'qonce'] },
  { slug: 'makhanda', name: 'Makhanda', province: 'eastern-cape', lat: -33.310, lng: 26.523, precision: 'town', aliases: ['grahamstown'] },
  { slug: 'mthatha', name: 'Mthatha', province: 'eastern-cape', lat: -31.589, lng: 28.790, precision: 'town', aliases: ['umtata', 'king sabata'] },
  { slug: 'mqanduli', name: 'Mqanduli', province: 'eastern-cape', lat: -31.818, lng: 28.761, precision: 'town' },
  { slug: 'queenstown', name: 'Komani', province: 'eastern-cape', lat: -31.898, lng: 26.875, precision: 'town', aliases: ['queenstown'] },
  { slug: 'bhisho', name: 'Bhisho', province: 'eastern-cape', lat: -32.847, lng: 27.441, precision: 'town', aliases: ['bisho'] },
  { slug: 'kimberley', name: 'Kimberley', province: 'northern-cape', lat: -28.728, lng: 24.750, precision: 'town', aliases: ['sol plaatje'] },
  { slug: 'upington', name: 'Upington', province: 'northern-cape', lat: -28.448, lng: 21.256, precision: 'town', aliases: ['dawid kruiper', '//khara hais'] },
  { slug: 'springbok', name: 'Springbok', province: 'northern-cape', lat: -29.664, lng: 17.886, precision: 'town', aliases: ['nama khoi'] },
  { slug: 'kuruman', name: 'Kuruman', province: 'northern-cape', lat: -27.452, lng: 23.432, precision: 'town', aliases: ['ga-segonyana', 'john taolo gaetsewe'] },
  { slug: 'de-aar', name: 'De Aar', province: 'northern-cape', lat: -30.650, lng: 24.012, precision: 'town', aliases: ['emthanjeni'] },
  { slug: 'bloemfontein', name: 'Bloemfontein', province: 'free-state', lat: -29.121, lng: 26.214, precision: 'metro', aliases: ['mangaung'] },
  { slug: 'welkom', name: 'Welkom', province: 'free-state', lat: -27.978, lng: 26.721, precision: 'town', aliases: ['matjhabeng'] },
  { slug: 'bethlehem', name: 'Bethlehem', province: 'free-state', lat: -28.231, lng: 28.307, precision: 'town', aliases: ['dihlabeng'] },
  { slug: 'kroonstad', name: 'Kroonstad', province: 'free-state', lat: -27.650, lng: 27.234, precision: 'town', aliases: ['moqhaka'] },
  { slug: 'durban', name: 'eThekwini', province: 'kwazulu-natal', lat: -29.858, lng: 31.029, precision: 'metro', aliases: ['durban', 'ethekwini', 'umhlanga', 'pinetown', 'chatsworth', 'umlazi'] },
  { slug: 'msunduzi', name: 'Pietermaritzburg', province: 'kwazulu-natal', lat: -29.601, lng: 30.379, precision: 'town', aliases: ['msunduzi', 'pmb'] },
  { slug: 'newcastle', name: 'Newcastle', province: 'kwazulu-natal', lat: -27.758, lng: 29.932, precision: 'town' },
  { slug: 'richards-bay', name: 'Richards Bay', province: 'kwazulu-natal', lat: -28.783, lng: 32.038, precision: 'town', aliases: ['umhlathuze', 'empangeni'] },
  { slug: 'ladysmith', name: 'Ladysmith', province: 'kwazulu-natal', lat: -28.559, lng: 29.780, precision: 'town', aliases: ['alfred duma'] },
  { slug: 'port-shepstone', name: 'Port Shepstone', province: 'kwazulu-natal', lat: -30.741, lng: 30.455, precision: 'town', aliases: ['ray nkonyeni'] },
  { slug: 'johannesburg', name: 'Johannesburg', province: 'gauteng', lat: -26.204, lng: 28.047, precision: 'metro', aliases: ['city of johannesburg', 'soweto', 'sandton', 'randburg', 'roodepoort', 'midrand'] },
  { slug: 'tshwane', name: 'Tshwane', province: 'gauteng', lat: -25.747, lng: 28.188, precision: 'metro', aliases: ['pretoria', 'city of tshwane', 'centurion', 'soshanguve'] },
  { slug: 'ekurhuleni', name: 'Ekurhuleni', province: 'gauteng', lat: -26.178, lng: 28.221, precision: 'metro', aliases: ['germiston', 'benoni', 'boksburg', 'kempton park', 'springs', 'alberton', 'or tambo'] },
  { slug: 'sedibeng', name: 'Sedibeng', province: 'gauteng', lat: -26.671, lng: 27.926, precision: 'town', aliases: ['vereeniging', 'vanderbijlpark', 'emfuleni'] },
  { slug: 'west-rand', name: 'West Rand', province: 'gauteng', lat: -26.162, lng: 27.726, precision: 'town', aliases: ['krugersdorp', 'mogale', 'randfontein'] },
  { slug: 'mbombela', name: 'Mbombela', province: 'mpumalanga', lat: -25.475, lng: 30.969, precision: 'town', aliases: ['nelspruit'] },
  { slug: 'emalahleni', name: 'eMalahleni', province: 'mpumalanga', lat: -25.872, lng: 29.233, precision: 'town', aliases: ['witbank'] },
  { slug: 'middelburg-mp', name: 'Middelburg', province: 'mpumalanga', lat: -25.775, lng: 29.465, precision: 'town', aliases: ['steve tshwete'] },
  { slug: 'secunda', name: 'Secunda', province: 'mpumalanga', lat: -26.550, lng: 29.167, precision: 'town', aliases: ['govan mbeki'] },
  { slug: 'ermelo', name: 'Ermelo', province: 'mpumalanga', lat: -26.533, lng: 29.983, precision: 'town', aliases: ['msukaligwa'] },
  { slug: 'polokwane', name: 'Polokwane', province: 'limpopo', lat: -23.904, lng: 29.469, precision: 'town', aliases: ['pietersburg'] },
  { slug: 'tzaneen', name: 'Tzaneen', province: 'limpopo', lat: -23.833, lng: 30.164, precision: 'town' },
  { slug: 'thohoyandou', name: 'Thohoyandou', province: 'limpopo', lat: -22.967, lng: 30.485, precision: 'town', aliases: ['thulamela'] },
  { slug: 'lephalale', name: 'Lephalale', province: 'limpopo', lat: -23.674, lng: 27.744, precision: 'town', aliases: ['ellisras'] },
  { slug: 'mokopane', name: 'Mokopane', province: 'limpopo', lat: -24.194, lng: 29.011, precision: 'town', aliases: ['potgietersrus'] },
  { slug: 'mahakanda', name: 'Mahikeng', province: 'north-west', lat: -25.865, lng: 25.644, precision: 'town', aliases: ['mahikeng', 'mmabatho', 'mafikeng'] },
  { slug: 'rustenburg', name: 'Rustenburg', province: 'north-west', lat: -25.667, lng: 27.242, precision: 'town' },
  { slug: 'klerksdorp', name: 'Klerksdorp', province: 'north-west', lat: -26.852, lng: 26.667, precision: 'town', aliases: ['matlosana', 'orikney'] },
  { slug: 'potchefstroom', name: 'Potchefstroom', province: 'north-west', lat: -26.715, lng: 27.103, precision: 'town', aliases: ['tlocwe', 'jb marks'] },
];

const SORTED = [...PLACES].sort((a, b) => longestAlias(b).length - longestAlias(a).length);

function longestAlias(p: Place): string {
  return [p.name, ...(p.aliases ?? [])].reduce((m, s) => (s.length > m.length ? s : m), '');
}

function norm(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export type LocationFields = {
  title?: string | null;
  description?: string | null;
  procuring_entity?: string | null;
  briefing_location?: string | null;
  province?: string | null;
};

export type ResolvedLocation = {
  label: string;
  town: string | null;
  province: string | null;
  provinceLabel: string | null;
  lat: number | null;
  lng: number | null;
  precision: PlacePrecision;
  source: 'briefing' | 'entity' | 'title' | 'province' | 'none';
};

function haystack(t: LocationFields): { briefing: string; entity: string; title: string; all: string } {
  const briefing = norm([t.briefing_location].filter(Boolean).join(' '));
  const entity = norm([t.procuring_entity].filter(Boolean).join(' '));
  const title = norm([t.title, t.description].filter(Boolean).join(' '));
  return { briefing, entity, title, all: `${briefing} ${entity} ${title}` };
}

function matchPlace(text: string, province?: string | null): Place | null {
  if (!text) return null;
  const padded = ` ${text} `;
  for (const place of SORTED) {
    if (province && place.province && place.province !== province && province !== 'national') continue;
    const names = [place.name, ...(place.aliases ?? [])].map(norm).filter((n) => n.length >= 3);
    if (names.some((n) => padded.includes(` ${n} `) || padded.includes(` ${n}'s `))) return place;
  }
  return null;
}

export function resolveLocation(t: LocationFields): ResolvedLocation {
  const h = haystack(t);
  const province = t.province && PROVINCE_CENTROIDS[t.province] ? t.province : null;
  const fromBrief = matchPlace(h.briefing, province);
  const fromEntity = matchPlace(h.entity, province);
  const fromTitle = matchPlace(h.title, province);
  const place = fromBrief || fromEntity || fromTitle;

  if (place) {
    return {
      label: province && place.province === province
        ? `${place.name}, ${PROVINCE_CENTROIDS[province].name}`
        : place.name,
      town: place.name,
      province: place.province,
      provinceLabel: place.province ? PROVINCE_CENTROIDS[place.province].name : null,
      lat: place.lat,
      lng: place.lng,
      precision: place.precision,
      source: fromBrief ? 'briefing' : fromEntity ? 'entity' : 'title',
    };
  }

  if (province === 'national') {
    const c = PROVINCE_CENTROIDS.national;
    return {
      label: 'National',
      town: null,
      province: 'national',
      provinceLabel: 'National',
      lat: c.lat,
      lng: c.lng,
      precision: 'national',
      source: 'province',
    };
  }

  if (province) {
    const c = PROVINCE_CENTROIDS[province];
    return {
      label: c.name,
      town: null,
      province,
      provinceLabel: c.name,
      lat: c.lat,
      lng: c.lng,
      precision: 'province',
      source: 'province',
    };
  }

  return {
    label: 'Location TBC',
    town: null,
    province: null,
    provinceLabel: null,
    lat: null,
    lng: null,
    precision: 'unknown',
    source: 'none',
  };
}

export type GeoPoint = {
  id: string;
  title: string;
  town: string | null;
  province: string | null;
  lat: number;
  lng: number;
  precision: PlacePrecision;
  value: number | null;
};

export type ProvinceBucket = {
  slug: string;
  name: string;
  count: number;
  valueZar: number;
};

export function clusterGeo(rows: Array<LocationFields & { id?: string; estimated_value?: number | null }>): {
  provinces: ProvinceBucket[];
  towns: Array<{ name: string; province: string | null; lat: number; lng: number; count: number; precision: PlacePrecision }>;
  points: GeoPoint[];
} {
  const provinces = new Map<string, ProvinceBucket>();
  for (const slug of Object.keys(PROVINCE_CENTROIDS)) {
    provinces.set(slug, { slug, name: PROVINCE_CENTROIDS[slug].name, count: 0, valueZar: 0 });
  }
  const townMap = new Map<string, { name: string; province: string | null; lat: number; lng: number; count: number; precision: PlacePrecision }>();
  const points: GeoPoint[] = [];

  for (const row of rows) {
    const loc = resolveLocation(row);
    const slug = loc.province ?? 'national';
    const bucket = provinces.get(slug) ?? provinces.get('national')!;
    bucket.count += 1;
    if (row.estimated_value) bucket.valueZar += row.estimated_value / 100;
    if (loc.lat != null && loc.lng != null && loc.precision !== 'unknown') {
      points.push({
        id: String(row.id ?? ''),
        title: (row.title || '').slice(0, 140),
        town: loc.town,
        province: loc.province,
        lat: loc.lat,
        lng: loc.lng,
        precision: loc.precision,
        value: row.estimated_value ?? null,
      });
    }
    if (loc.town && loc.lat != null && loc.lng != null) {
      const key = loc.town.toLowerCase();
      const existing = townMap.get(key);
      if (existing) existing.count += 1;
      else townMap.set(key, {
        name: loc.town,
        province: loc.province,
        lat: loc.lat,
        lng: loc.lng,
        count: 1,
        precision: loc.precision,
      });
    }
  }

  return {
    provinces: [...provinces.values()].sort((a, b) => b.count - a.count),
    towns: [...townMap.values()].sort((a, b) => b.count - a.count),
    points,
  };
}
