/** Public offices of buyers, used only when the notice does not name the work site. */

export type OfficeHit = { name: string; lat: number; lng: number; precision: 'town' | 'metro' };

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

type Org = { keys: string[]; name: string; lat: number; lng: number; regions?: Record<string, OfficeHit> };

const ORGS: Org[] = [
  { keys: ['dithakong'], name: 'Dithakong', lat: -27.083, lng: 23.867 },
  { keys: ['zuikerbosch'], name: 'Zuikerbosch', lat: -26.690, lng: 27.840 },
  { keys: ['ekurhuieni', 'ekurhuleni housing'], name: 'Ekurhuleni Housing', lat: -26.178, lng: 28.221 },
  { keys: ['sentech'], name: 'Sentech Radiokop', lat: -26.089, lng: 27.921 },
  { keys: ['rand water'], name: 'Rand Water', lat: -26.283, lng: 28.048 },
  { keys: ['denel'], name: 'Denel PMP', lat: -25.752, lng: 28.148 },
  { keys: ['broadcasting corporation', 'sabc'], name: 'SABC Auckland Park', lat: -26.185, lng: 28.000 },
  { keys: ['railway safety'], name: 'Railway Safety Regulator', lat: -25.860, lng: 28.189 },
  { keys: ['weather service'], name: 'SA Weather Service', lat: -25.955, lng: 28.188 },
  { keys: ['film and video', 'nfvf'], name: 'NFVF', lat: -26.146, lng: 28.041 },
  { keys: ['national research', 'saasta'], name: 'NRF', lat: -25.755, lng: 28.277 },
  { keys: ['science & technology', 'science and technology'], name: 'DSI', lat: -25.746, lng: 28.188 },
  { keys: ['diamond and precious'], name: 'SADPMR', lat: -26.107, lng: 28.056 },
  { keys: ['ombud for financial'], name: 'FAIS Ombud', lat: -25.783, lng: 28.277 },
  { keys: ['development corporation'], name: 'Free State Development Corporation', lat: -29.118, lng: 26.225 },
  { keys: ['city of cape town', 'iziko'], name: 'Cape Town', lat: -33.929, lng: 18.415 },
  { keys: ['city of ekurhuleni', 'ekurhuleni'], name: 'Ekurhuleni', lat: -26.178, lng: 28.221 },
  { keys: ['sabs', 'bureau of standards'], name: 'SABS Groenkloof', lat: -25.772, lng: 28.209 },
  { keys: ['eskom'], name: 'Eskom Megawatt Park', lat: -26.035, lng: 28.068 },
  { keys: ['transnet', 'tfr'], name: 'Transnet', lat: -26.205, lng: 28.047 },
  { keys: ['airports company', 'acsa'], name: 'ACSA', lat: -26.136, lng: 28.241 },
  { keys: ['northern cape'], name: 'Kimberley', lat: -28.738, lng: 24.764 },
  { keys: ['free state'], name: 'Bloemfontein', lat: -29.118, lng: 26.225 },
];

function norm(s: string): string {
  return ` ${s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()} `;
}

export function issuerOffice(entity: string | null | undefined, extra: string | null | undefined, province: string | null): OfficeHit | null {
  const blob = norm(`${entity || ''} ${extra || ''}`);
  if (blob.trim().length < 3) return null;
  for (const org of ORGS) {
    if (!org.keys.some((k) => blob.includes(k))) continue;
    if (province && org.regions?.[province]) return org.regions[province];
    return { name: org.name, lat: org.lat, lng: org.lng, precision: 'town' };
  }
  if (province && SEATS[province] && /department|municipality|agency|authority|college|hospital|northern cape|free state|eastern cape|western cape/.test(blob)) {
    return SEATS[province];
  }
  return null;
}
