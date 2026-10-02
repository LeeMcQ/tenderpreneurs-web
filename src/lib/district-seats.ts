/** District seats named on notices. Used only after work site, briefing, and issuer office fail. */

export type Seat = { name: string; lat: number; lng: number; keys: string[]; province: string };

export const DISTRICT_SEATS: Seat[] = [
  { name: 'OR Tambo', lat: -31.589, lng: 28.790, province: 'eastern-cape', keys: ['or tambo', 'o r tambo'] },
  { name: 'Chris Hani', lat: -31.898, lng: 26.875, province: 'eastern-cape', keys: ['chris hani'] },
  { name: 'Amathole', lat: -32.790, lng: 26.830, province: 'eastern-cape', keys: ['amathole'] },
  { name: 'Sarah Baartman', lat: -33.961, lng: 25.602, province: 'eastern-cape', keys: ['sarah baartman', 'cacadu'] },
  { name: 'Joe Gqabi', lat: -30.694, lng: 26.711, province: 'eastern-cape', keys: ['joe gqabi', 'ukahlamba'] },
  { name: 'Alfred Nzo', lat: -30.800, lng: 29.370, province: 'eastern-cape', keys: ['alfred nzo'] },
  { name: 'King Cetshwayo', lat: -28.783, lng: 32.038, province: 'kwazulu-natal', keys: ['king cetshwayo', 'uthungulu'] },
  { name: 'uMgungundlovu', lat: -29.601, lng: 30.379, province: 'kwazulu-natal', keys: ['umgungundlovu'] },
  { name: 'uThukela', lat: -28.559, lng: 29.780, province: 'kwazulu-natal', keys: ['uthukela'] },
  { name: 'Amajuba', lat: -27.758, lng: 29.932, province: 'kwazulu-natal', keys: ['amajuba'] },
  { name: 'Zululand', lat: -28.335, lng: 31.416, province: 'kwazulu-natal', keys: ['zululand'] },
  { name: 'uMkhanyakude', lat: -27.620, lng: 32.040, province: 'kwazulu-natal', keys: ['umkhanyakude'] },
  { name: 'iLembe', lat: -29.328, lng: 31.290, province: 'kwazulu-natal', keys: ['ilembe'] },
  { name: 'Ugu', lat: -30.741, lng: 30.455, province: 'kwazulu-natal', keys: ['ugu district'] },
  { name: 'Harry Gwala', lat: -30.160, lng: 30.060, province: 'kwazulu-natal', keys: ['harry gwala', 'sisonke'] },
  { name: 'uMzinyathi', lat: -28.166, lng: 30.234, province: 'kwazulu-natal', keys: ['umzinyathi'] },
  { name: 'Cape Winelands', lat: -33.646, lng: 19.449, province: 'western-cape', keys: ['cape winelands'] },
  { name: 'Garden Route', lat: -33.963, lng: 22.462, province: 'western-cape', keys: ['garden route', 'eden district'] },
  { name: 'West Coast', lat: -32.776, lng: 18.759, province: 'western-cape', keys: ['west coast district'] },
  { name: 'Overberg', lat: -34.230, lng: 19.428, province: 'western-cape', keys: ['overberg'] },
  { name: 'Central Karoo', lat: -32.357, lng: 22.583, province: 'western-cape', keys: ['central karoo'] },
  { name: 'Fezile Dabi', lat: -26.814, lng: 27.829, province: 'free-state', keys: ['fezile dabi'] },
  { name: 'Lejweleputswa', lat: -27.978, lng: 26.721, province: 'free-state', keys: ['lejweleputswa'] },
  { name: 'Thabo Mofutsanyana', lat: -28.231, lng: 28.307, province: 'free-state', keys: ['thabo mofutsanyana'] },
  { name: 'Xhariep', lat: -30.030, lng: 25.780, province: 'free-state', keys: ['xhariep'] },
  { name: 'Nkangala', lat: -25.775, lng: 29.465, province: 'mpumalanga', keys: ['nkangala'] },
  { name: 'Gert Sibande', lat: -26.533, lng: 29.983, province: 'mpumalanga', keys: ['gert sibande'] },
  { name: 'Ehlanzeni', lat: -25.475, lng: 30.969, province: 'mpumalanga', keys: ['ehlanzeni'] },
  { name: 'Capricorn', lat: -23.904, lng: 29.469, province: 'limpopo', keys: ['capricorn'] },
  { name: 'Mopani', lat: -23.833, lng: 30.164, province: 'limpopo', keys: ['mopani'] },
  { name: 'Vhembe', lat: -22.967, lng: 30.485, province: 'limpopo', keys: ['vhembe'] },
  { name: 'Waterberg', lat: -23.674, lng: 27.744, province: 'limpopo', keys: ['waterberg'] },
  { name: 'Sekhukhune', lat: -24.750, lng: 29.950, province: 'limpopo', keys: ['sekhukhune'] },
  { name: 'Bojanala', lat: -25.667, lng: 27.242, province: 'north-west', keys: ['bojanala'] },
  { name: 'Ngaka Modiri Molema', lat: -25.865, lng: 25.644, province: 'north-west', keys: ['ngaka modiri'] },
  { name: 'Dr Ruth Segomotsi Mompati', lat: -26.957, lng: 24.730, province: 'north-west', keys: ['ruth segomotsi', 'bophirima'] },
  { name: 'Dr Kenneth Kaunda', lat: -26.852, lng: 26.667, province: 'north-west', keys: ['kenneth kaunda'] },
  { name: 'Frances Baard', lat: -28.738, lng: 24.764, province: 'northern-cape', keys: ['frances baard'] },
  { name: 'John Taolo Gaetsewe', lat: -27.452, lng: 23.432, province: 'northern-cape', keys: ['john taolo', 'kgalagadi'] },
  { name: 'Pixley ka Seme', lat: -30.650, lng: 24.012, province: 'northern-cape', keys: ['pixley ka seme'] },
  { name: 'Namakwa', lat: -29.664, lng: 17.886, province: 'northern-cape', keys: ['namakwa'] },
  { name: 'ZF Mgcawu', lat: -28.448, lng: 21.256, province: 'northern-cape', keys: ['zf mgcawu', 'siyanda'] },
  { name: 'Sedibeng', lat: -26.671, lng: 27.926, province: 'gauteng', keys: ['sedibeng'] },
  { name: 'West Rand', lat: -26.162, lng: 27.726, province: 'gauteng', keys: ['west rand'] },
];

function norm(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

export function districtSeat(text: string, province?: string | null): Seat | null {
  const blob = ` ${norm(text)} `;
  if (blob.trim().length < 4) return null;
  const hits = DISTRICT_SEATS.filter((d) => d.keys.some((k) => blob.includes(` ${k} `) || blob.includes(k)));
  if (!hits.length) return null;
  if (province && province !== 'national') {
    return hits.find((d) => d.province === province) || hits[0];
  }
  return hits[0];
}
