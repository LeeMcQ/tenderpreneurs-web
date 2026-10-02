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

type Org = {
  keys: string[];
  name: string;
  lat: number;
  lng: number;
  regions?: Record<string, OfficeHit>;
};

const ORGS: Org[] = [
  { keys: ['eskom'], name: 'Eskom Megawatt Park', lat: -26.035, lng: 28.068, regions: {
    'western-cape': { name: 'Eskom Western Cape', lat: -33.894, lng: 18.636, precision: 'town' },
    'eastern-cape': { name: 'Eskom Eastern Cape', lat: -33.961, lng: 25.602, precision: 'town' },
    'kwazulu-natal': { name: 'Eskom KwaZulu-Natal', lat: -29.835, lng: 30.925, precision: 'town' },
    'free-state': { name: 'Eskom Free State', lat: -29.118, lng: 26.214, precision: 'town' },
    mpumalanga: { name: 'Eskom Mpumalanga', lat: -25.877, lng: 29.233, precision: 'town' },
    limpopo: { name: 'Eskom Limpopo', lat: -23.904, lng: 29.469, precision: 'town' },
    'north-west': { name: 'Eskom North West', lat: -25.667, lng: 27.242, precision: 'town' },
    'northern-cape': { name: 'Eskom Northern Cape', lat: -28.738, lng: 24.764, precision: 'town' },
    gauteng: { name: 'Eskom Megawatt Park', lat: -26.035, lng: 28.068, precision: 'town' },
  } },
  { keys: ['transnet'], name: 'Transnet', lat: -26.205, lng: 28.047, regions: {
    'western-cape': { name: 'Transnet Cape Town', lat: -33.906, lng: 18.436, precision: 'town' },
    'eastern-cape': { name: 'Transnet Gqeberha', lat: -33.958, lng: 25.636, precision: 'town' },
    'kwazulu-natal': { name: 'Transnet Durban', lat: -29.868, lng: 31.027, precision: 'town' },
    mpumalanga: { name: 'Transnet eMalahleni', lat: -25.877, lng: 29.233, precision: 'town' },
    gauteng: { name: 'Transnet Park', lat: -26.205, lng: 28.047, precision: 'metro' },
  } },
  { keys: ['sanral', 'roads agency'], name: 'SANRAL', lat: -25.786, lng: 28.277, regions: {
    'western-cape': { name: 'SANRAL Western Cape', lat: -33.932, lng: 18.860, precision: 'town' },
    'eastern-cape': { name: 'SANRAL Eastern Cape', lat: -33.961, lng: 25.602, precision: 'town' },
    'kwazulu-natal': { name: 'SANRAL KwaZulu-Natal', lat: -29.801, lng: 30.818, precision: 'town' },
    'free-state': { name: 'SANRAL Free State', lat: -29.118, lng: 26.214, precision: 'town' },
    'northern-cape': { name: 'SANRAL Northern Cape', lat: -28.738, lng: 24.764, precision: 'town' },
    gauteng: { name: 'SANRAL Northern Region', lat: -25.786, lng: 28.277, precision: 'town' },
  } },
  { keys: ['prasa', 'passenger rail'], name: 'PRASA', lat: -26.194, lng: 28.036 },
  { keys: ['sentech'], name: 'Sentech', lat: -26.089, lng: 27.921 },
  { keys: ['rand water'], name: 'Rand Water', lat: -26.283, lng: 28.048 },
  { keys: ['sabs', 'bureau of standards'], name: 'SABS Groenkloof', lat: -25.772, lng: 28.209 },
  { keys: ['nyda', 'youth development'], name: 'NYDA', lat: -26.055, lng: 28.091 },
  { keys: ['border management'], name: 'Border Management Authority', lat: -25.747, lng: 28.229 },
  { keys: ['cross-border', 'cross border road'], name: 'C-BRTA', lat: -25.783, lng: 28.277 },
  { keys: ['sars', 'revenue service'], name: 'SARS', lat: -25.770, lng: 28.235 },
  { keys: ['sita', 'state information'], name: 'SITA', lat: -25.832, lng: 28.247 },
  { keys: ['airports company', 'acsa'], name: 'ACSA', lat: -26.136, lng: 28.241 },
  { keys: ['south african post', 'sapo'], name: 'SA Post Office', lat: -25.747, lng: 28.229 },
  { keys: ['telkom'], name: 'Telkom', lat: -25.786, lng: 28.277 },
  { keys: ['trade and investment', 'tikzn'], name: 'Trade & Investment KZN', lat: -29.858, lng: 31.021 },
  { keys: ['isimangaliso', 'i simangaliso'], name: 'iSimangaliso', lat: -28.376, lng: 32.412 },
  { keys: ['bergrivier', 'piketberg'], name: 'Bergrivier', lat: -32.776, lng: 18.759 },
  { keys: ['environment, forestry', 'dffe', 'forestry and fisheries'], name: 'Environment House', lat: -25.744, lng: 28.204 },
  { keys: ['officer of the premier', 'office of the premier'], name: 'Office of the Premier', lat: -25.746, lng: 28.188 },
];

function norm(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

export function issuerOffice(
  entity: string | null | undefined,
  briefing: string | null | undefined,
  province: string | null,
): OfficeHit | null {
  const blob = norm(`${entity || ''} ${briefing || ''}`);
  if (!blob) return null;
  for (const org of ORGS) {
    if (!org.keys.some((k) => blob.includes(k))) continue;
    if (province && org.regions?.[province]) return org.regions[province];
    if (province && SEATS[province] && province !== 'national') return { ...SEATS[province], name: org.name };
    return { name: org.name, lat: org.lat, lng: org.lng, precision: 'town' };
  }
  if (province && SEATS[province] && /province|department|municipality|premier|metro|district|agency|authority|board|council|soc|hospital|water board/.test(blob)) {
    return SEATS[province];
  }
  if ((!province || province === 'national') && /national|department|soc ltd|agency|authority/.test(blob)) {
    return SEATS.national;
  }
  return null;
}
