/** Public offices of buyers, used only when the notice does not name the work site. */

export type OfficeHit = {
  name: string;
  lat: number;
  lng: number;
  precision: 'town' | 'metro';
};

const SEATS: Record<string, OfficeHit> = {
  'western-cape': { name: 'Cape Town', lat: -33.9258, lng: 18.4232, precision: 'metro' },
  'eastern-cape': { name: 'Bhisho', lat: -32.849, lng: 27.438, precision: 'town' },
  'northern-cape': { name: 'Kimberley', lat: -28.738, lng: 24.764, precision: 'town' },
  'free-state': { name: 'Bloemfontein', lat: -29.118, lng: 26.225, precision: 'metro' },
  'kwazulu-natal': { name: 'Pietermaritzburg', lat: -29.6006, lng: 30.3794, precision: 'town' },
  gauteng: { name: 'Johannesburg', lat: -26.2041, lng: 28.0473, precision: 'metro' },
  mpumalanga: { name: 'Mbombela', lat: -25.4753, lng: 30.9694, precision: 'town' },
  limpopo: { name: 'Polokwane', lat: -23.9045, lng: 29.4688, precision: 'town' },
  'north-west': { name: 'Mahikeng', lat: -25.8652, lng: 25.6442, precision: 'town' },
  national: { name: 'Pretoria', lat: -25.7461, lng: 28.1881, precision: 'metro' },
};

const PREFIX: Array<[RegExp, string]> = [
  [/\bwestern cape\b/, 'western-cape'],
  [/\beastern cape\b/, 'eastern-cape'],
  [/\bnorthern cape\b/, 'northern-cape'],
  [/\bfree state\b/, 'free-state'],
  [/\bkwa ?zulu\b/, 'kwazulu-natal'],
  [/\bgauteng\b/, 'gauteng'],
  [/\bmpumalanga\b/, 'mpumalanga'],
  [/\blimpopo\b/, 'limpopo'],
  [/\bnorth west\b/, 'north-west'],
];

type Org = { keys: string[]; name: string; lat: number; lng: number; regions?: Record<string, OfficeHit> };

const ORGS: Org[] = [
  { keys: ['eskom'], name: 'Eskom Megawatt Park', lat: -26.035, lng: 28.068, regions: {
    'western-cape': { name: 'Eskom Western Cape', lat: -33.894, lng: 18.636, precision: 'town' },
    'eastern-cape': { name: 'Eskom Eastern Cape', lat: -33.961, lng: 25.602, precision: 'town' },
    'kwazulu-natal': { name: 'Eskom KwaZulu-Natal', lat: -29.835, lng: 30.925, precision: 'town' },
    mpumalanga: { name: 'Eskom Mpumalanga', lat: -25.877, lng: 29.233, precision: 'town' },
    gauteng: { name: 'Eskom Megawatt Park', lat: -26.035, lng: 28.068, precision: 'town' },
  } },
  { keys: ['transnet', 'tfr'], name: 'Transnet', lat: -26.205, lng: 28.047, regions: {
    'western-cape': { name: 'Transnet Cape Town', lat: -33.906, lng: 18.436, precision: 'town' },
    'eastern-cape': { name: 'Transnet Gqeberha', lat: -33.958, lng: 25.636, precision: 'town' },
    'kwazulu-natal': { name: 'Transnet Durban', lat: -29.868, lng: 31.027, precision: 'town' },
    gauteng: { name: 'Transnet Park', lat: -26.205, lng: 28.047, precision: 'metro' },
  } },
  { keys: ['city of cape town'], name: 'City of Cape Town', lat: -33.9258, lng: 18.4232 },
  { keys: ['city of tshwane', 'city of pretoria'], name: 'City of Tshwane', lat: -25.746, lng: 28.188 },
  { keys: ['city of johannesburg', 'city of joburg'], name: 'City of Johannesburg', lat: -26.204, lng: 28.047 },
  { keys: ['ethekwini', 'city of durban'], name: 'eThekwini', lat: -29.858, lng: 31.021 },
  { keys: ['electoral commission', ' iec'], name: 'IEC', lat: -25.746, lng: 28.188 },
  { keys: ['national research', 'saasta', 'nrf'], name: 'NRF', lat: -25.755, lng: 28.277 },
  { keys: ['film and video', 'nfvf'], name: 'NFVF', lat: -26.146, lng: 28.041 },
  { keys: ['science & technology', 'science and technology'], name: 'DSI', lat: -25.746, lng: 28.188 },
  { keys: ['eastcape midlands', 'tvet college'], name: 'Eastcape Midlands College', lat: -33.768, lng: 25.405 },
  { keys: ['sanral', 'roads agency'], name: 'SANRAL', lat: -25.786, lng: 28.277 },
  { keys: ['sars', 'revenue service'], name: 'SARS', lat: -25.770, lng: 28.235 },
  { keys: ['sita'], name: 'SITA', lat: -25.832, lng: 28.247 },
  { keys: ['prasa', 'passenger rail'], name: 'PRASA', lat: -26.194, lng: 28.036 },
  { keys: ['sentech'], name: 'Sentech', lat: -26.089, lng: 27.921 },
  { keys: ['rand water'], name: 'Rand Water', lat: -26.283, lng: 28.048 },
];

function norm(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

export function issuerOffice(entity: string | null | undefined, briefing: string | null | undefined, province: string | null): OfficeHit | null {
  const blob = norm(`${entity || ''} ${briefing || ''}`);
  if (!blob) return null;
  for (const org of ORGS) {
    if (!org.keys.some((k) => blob.includes(k.trim()))) continue;
    if (province && org.regions?.[province]) return org.regions[province];
    if (province && SEATS[province] && province !== 'national' && !org.keys.some((k) => k.includes('city of') || k.includes('ethekwini'))) {
      return { ...SEATS[province], name: org.name };
    }
    return { name: org.name, lat: org.lat, lng: org.lng, precision: 'town' };
  }
  for (const [re, slug] of PREFIX) {
    if (re.test(blob) && SEATS[slug]) return { ...SEATS[slug], name: entity?.split('-')[0]?.trim() || SEATS[slug].name };
  }
  if (province && SEATS[province] && /department|municipality|premier|metro|district|agency|authority|board|council|soc|hospital|college|fund/.test(blob)) {
    return SEATS[province];
  }
  if ((!province || province === 'national') && /national|department|soc|agency|authority|foundation/.test(blob)) return SEATS.national;
  return null;
}
