import { resolveLocation, type LocationFields, type PlacePrecision } from './tender-location';

const GPS = /(-2[2-9]\.\d{2,7})\s*[,\s]\s*(1[6-9]|2[0-9]|3[0-3])\.(\d{2,7})/;

export type TenderPin = {
  id: string;
  lat: number;
  lng: number;
  sector: string | null;
  precision: PlacePrecision | 'gps';
  label: string;
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

/** Keep exact GPS. Fan out town/province pins so 200 Gauteng notices are not one dot. */
export function spreadPin(id: string, lat: number, lng: number, precision: string): { lat: number; lng: number } {
  if (precision === 'gps' || precision === 'street') return { lat, lng };
  const span =
    precision === 'town' || precision === 'metro' ? 0.028
    : precision === 'province' ? 0.11
    : 0.18;
  const { a, u } = hashAngle(id);
  const r = (0.25 + u * 0.75) * span;
  return { lat: lat + Math.sin(a) * r, lng: lng + Math.cos(a) * r };
}

export function pinFromTender(row: LocationFields & { id: string; sector?: string | null }): TenderPin | null {
  const gps = parseGps([row.title, row.description, row.briefing_location].filter(Boolean).join(' '));
  const needFirst = resolveLocation({
    title: row.title,
    description: row.description,
    briefing_location: row.briefing_location,
    procuring_entity: null,
    province: row.province,
  });
  const loc = needFirst.town || needFirst.precision === 'national' || needFirst.precision === 'province'
    ? needFirst
    : resolveLocation(row);
  const baseLat = gps?.lat ?? loc.lat;
  const baseLng = gps?.lng ?? loc.lng;
  if (baseLat == null || baseLng == null) return null;
  const precision = gps ? 'gps' as const : loc.precision;
  const spread = spreadPin(row.id, baseLat, baseLng, precision);
  return {
    id: row.id,
    lat: spread.lat,
    lng: spread.lng,
    sector: row.sector ?? null,
    precision,
    label: gps ? loc.label : loc.label,
  };
}
