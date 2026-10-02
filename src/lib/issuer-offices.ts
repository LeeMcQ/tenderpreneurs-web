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
  { keys: ['city of cape town', 'iziko'], name: 'Cape Town', lat: -33.929, lng: 18.415 },
  { keys: ['city of tshwane', 'tshwane automotive', 'tasez'], name: 'Tshwane', lat: -25.735, lng: 28.308 },
  { keys: ['city of johannesburg'], name: 'Johannesburg', lat: -26.204, lng: 28.047 },
  { keys: ['city of ekurhuleni', 'ekurhuleni'], name: 'Ekurhuleni', lat: -26.178, lng: 28.221 },
  { keys: ['ethekwini'], name: 'eThekwini', lat: -29.858, lng: 31.021 },
  { keys: ['mandela bay theatre', 'nelson mandela bay'], name: 'Gqeberha', lat: -33.961, lng: 25.602 },
  { keys: ['mathibestad'], name: 'Mathibestad', lat: -25.208, lng: 28.128 },
  { keys: ['king shaka'], name: 'King Shaka', lat: -29.614, lng: 31.120 },
  { keys: ['sabs', 'bureau of standards'], name: 'SABS Groenkloof', lat: -25.772, lng: 28.209 },
  { keys: ['statistics south africa', 'stats sa'], name: 'Stats SA', lat: -25.746, lng: 28.232 },
  { keys: ['south african airways', 'saa '], name: 'SAA Airways Park', lat: -26.136, lng: 28.241 },
  { keys: ['freedom park'], name: 'Freedom Park', lat: -25.767, lng: 28.187 },
  { keys: ['airports company', 'acsa'], name: 'ACSA', lat: -26.136, lng: 28.241, regions: {
    'kwazulu-natal': { name: 'King Shaka', lat: -29.614, lng: 31.120, precision: 'town' },
    'western-cape': { name: 'Cape Town Airport', lat: -33.970, lng: 18.602, precision: 'town' },
  } },
  { keys: ['air traffic', 'atns'], name: 'ATNS', lat: -26.143, lng: 28.198 },
  { keys: ['south african tourism'], name: 'SA Tourism', lat: -26.128, lng: 28.053 },
  { keys: ['water and sanitation'], name: 'Water and Sanitation', lat: -25.746, lng: 28.188 },
  { keys: ['independent development trust', 'idt'], name: 'IDT', lat: -25.747, lng: 28.229 },
  { keys: ['eskom'], name: 'Eskom Megawatt Park', lat: -26.035, lng: 28.068 },
  { keys: ['transnet', 'tfr'], name: 'Transnet', lat: -26.205, lng: 28.047 },
  { keys: ['sanral'], name: 'SANRAL', lat: -25.786, lng: 28.277 },
  { keys: ['sars'], name: 'SARS', lat: -25.770, lng: 28.235 },
  { keys: ['sita'], name: 'SITA', lat: -25.832, lng: 28.247 },
  { keys: ['prasa'], name: 'PRASA', lat: -26.194, lng: 28.036 },
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
    if (province && SEATS[province] && province !== 'national' && /water and sanitation|independent development|idt/.test(blob)) {
      return { ...SEATS[province], name: org.name };
    }
    return { name: org.name, lat: org.lat, lng: org.lng, precision: 'town' };
  }
  if (province && SEATS[province] && /department|municipality|premier|metro|district|agency|authority|board|council|soc|hospital|college|fund|eastern cape|western cape|gauteng|kwazulu/.test(blob)) {
    return SEATS[province];
  }
  return null;
}
