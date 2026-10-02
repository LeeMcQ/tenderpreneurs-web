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
  { keys: ['national research', 'saasta', 'nrf'], name: 'NRF', lat: -25.755, lng: 28.277 },
  { keys: ['science & technology', 'science and technology'], name: 'DSI', lat: -25.746, lng: 28.188 },
  { keys: ['diamond and precious'], name: 'SADPMR', lat: -26.107, lng: 28.056 },
  { keys: ['ombud for financial'], name: 'FAIS Ombud', lat: -25.783, lng: 28.277 },
  { keys: ['development corporation'], name: 'Free State Development Corporation', lat: -29.118, lng: 26.225 },
  { keys: ['city of cape town', 'iziko'], name: 'Cape Town', lat: -33.929, lng: 18.415 },
  { keys: ['city of tshwane', 'tshwane automotive', 'tasez'], name: 'Tshwane', lat: -25.735, lng: 28.308 },
  { keys: ['city of johannesburg'], name: 'Johannesburg', lat: -26.204, lng: 28.047 },
  { keys: ['city of ekurhuleni', 'ekurhuleni'], name: 'Ekurhuleni', lat: -26.178, lng: 28.221 },
  { keys: ['ethekwini'], name: 'eThekwini', lat: -29.858, lng: 31.021 },
  { keys: ['mandela bay theatre'], name: 'Gqeberha', lat: -33.961, lng: 25.602 },
  { keys: ['mathibestad'], name: 'Mathibestad', lat: -25.208, lng: 28.128 },
  { keys: ['king shaka'], name: 'King Shaka', lat: -29.614, lng: 31.120 },
  { keys: ['sabs', 'bureau of standards'], name: 'SABS Groenkloof', lat: -25.772, lng: 28.209 },
  { keys: ['statistics south africa', 'stats sa'], name: 'Stats SA', lat: -25.746, lng: 28.232 },
  { keys: ['south african airways'], name: 'SAA Airways Park', lat: -26.136, lng: 28.241 },
  { keys: ['freedom park'], name: 'Freedom Park', lat: -25.767, lng: 28.187 },
  { keys: ['airports company', 'acsa'], name: 'ACSA', lat: -26.136, lng: 28.241 },
  { keys: ['air traffic', 'atns'], name: 'ATNS', lat: -26.143, lng: 28.198 },
  { keys: ['south african tourism'], name: 'SA Tourism', lat: -26.128, lng: 28.053 },
  { keys: ['water and sanitation'], name: 'Water and Sanitation', lat: -25.746, lng: 28.188 },
  { keys: ['independent development trust'], name: 'IDT', lat: -25.747, lng: 28.229 },
  { keys: ['eskom'], name: 'Eskom Megawatt Park', lat: -26.035, lng: 28.068 },
  { keys: ['transnet', 'tfr'], name: 'Transnet', lat: -26.205, lng: 28.047 },
  { keys: ['sanral'], name: 'SANRAL', lat: -25.786, lng: 28.277 },
  { keys: ['sars'], name: 'SARS', lat: -25.770, lng: 28.235 },
  { keys: ['sita'], name: 'SITA', lat: -25.832, lng: 28.247 },
  { keys: ['prasa'], name: 'PRASA', lat: -26.194, lng: 28.036 },
  { keys: ['northern cape'], name: 'Kimberley', lat: -28.738, lng: 24.764 },
  { keys: ['eastern cape'], name: 'Bhisho', lat: -32.849, lng: 27.438 },
  { keys: ['western cape'], name: 'Cape Town', lat: -33.9258, lng: 18.4232 },
  { keys: ['free state'], name: 'Bloemfontein', lat: -29.118, lng: 26.225 },
  { keys: ['kwazulu', 'kwa zulu'], name: 'Pietermaritzburg', lat: -29.601, lng: 30.379 },
];

function norm(s: string): string {
  return ` ${s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()} `;
}

export function issuerOffice(entity: string | null | undefined, extra: string | null | undefined, province: string | null): OfficeHit | null {
  const blob = norm(`${entity || ''} ${extra || ''}`);
  if (blob.trim().length < 3) return null;
  for (const org of ORGS) {
    if (!org.keys.some((k) => blob.includes(k))) continue;
    return { name: org.name, lat: org.lat, lng: org.lng, precision: 'town' };
  }
  if (province && SEATS[province] && /department|municipality|agency|authority|college|hospital|board|council|soc|fund/.test(blob)) {
    return SEATS[province];
  }
  return null;
}
