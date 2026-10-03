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
const WITBANK: OfficeHit = { name: 'Eskom Witbank', lat: -25.877, lng: 29.201, precision: 'town' };
const ORGS: Array<{ keys: string[]; name: string; lat: number; lng: number }> = [
  { keys: ['sentech'], name: 'Sentech Radiokop', lat: -26.089, lng: 27.921 },
  { keys: ['eskom'], name: 'Eskom Megawatt Park', lat: -26.035, lng: 28.068 },
  { keys: ['transnet', 'tfr'], name: 'Transnet', lat: -26.205, lng: 28.047 },
  { keys: ['sanral'], name: 'SANRAL', lat: -25.786, lng: 28.277 },
  { keys: ['sars'], name: 'SARS', lat: -25.770, lng: 28.235 },
  { keys: ['prasa'], name: 'PRASA', lat: -26.194, lng: 28.036 },
  { keys: ['city of cape town'], name: 'Cape Town', lat: -33.929, lng: 18.415 },
  { keys: ['city of johannesburg'], name: 'Johannesburg', lat: -26.204, lng: 28.047 },
  { keys: ['city of tshwane'], name: 'Tshwane', lat: -25.735, lng: 28.308 },
  { keys: ['ethekwini'], name: 'eThekwini', lat: -29.858, lng: 31.021 },
  { keys: ['eastern cape'], name: 'Bhisho', lat: -32.849, lng: 27.438 },
  { keys: ['environment'], name: 'Environment House', lat: -25.746, lng: 28.188 },
];
function norm(s: string): string { return ` ${s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()} `; }
export function issuerOffice(entity: string | null | undefined, extra: string | null | undefined, province: string | null): OfficeHit | null {
  const blob = norm(`${entity || ''} ${extra || ''}`);
  if (blob.includes('eskom') && province === 'mpumalanga') return WITBANK;
  for (const org of ORGS) {
    if (org.keys.some((k) => blob.includes(k))) return { name: org.name, lat: org.lat, lng: org.lng, precision: 'town' };
  }
  if (province && SEATS[province] && /department|municipality|agency|authority|college|hospital|board|council|soc|fund/.test(blob)) return SEATS[province];
  return null;
}
