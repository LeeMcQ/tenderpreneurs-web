/**
 * src/lib/profile.ts
 *
 * Supplier-profile normalisation. Converts onboarding's display labels into the
 * exact slugs / numbers the tenders table and matching/scoring expect.
 * Fixes review item R7 (silent match failures from label/slug mismatch). PURE.
 */

export const PROVINCE_SLUGS = [
  'eastern-cape','free-state','gauteng','kwazulu-natal','limpopo',
  'mpumalanga','north-west','northern-cape','western-cape','national',
];
export const SECTOR_SLUGS = [
  'agriculture','catering','cleaning','construction','consulting','education',
  'energy','health','ict','legal','security','transport',
];

export function slugify(s: string): string {
  return s.toLowerCase().trim()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** "Eastern Cape" → "eastern-cape"; passes through valid slugs; null if unknown. */
export function provinceSlug(label: string): string | null {
  const slug = slugify(label);
  return PROVINCE_SLUGS.includes(slug) ? slug : null;
}

/** "ICT" → "ict"; "KwaZulu-Natal"→"kwazulu-natal"; null if unknown. */
export function sectorSlug(label: string): string | null {
  const slug = slugify(label);
  return SECTOR_SLUGS.includes(slug) ? slug : null;
}

/** "Level 2 Contributor" → 2; "Exempt Micro Enterprise (EME)" → 1 (EMEs are
 *  treated as Level 4 by default but auto-recognised; we map EME→1 only if the
 *  firm is >51% black-owned — unknown here, so map EME→4 conservatively). */
export function bbbeeToLevel(label: string | null | undefined): number | null {
  if (!label) return null;
  const l = label.toLowerCase();
  if (l.includes('prefer not')) return null;
  if (l.includes('eme') || l.includes('exempt micro')) return 4; // conservative default
  const m = l.match(/level\s*(\d)/);
  if (m) { const n = parseInt(m[1], 10); return n >= 1 && n <= 8 ? n : null; }
  return null;
}

export interface RawProfileInput {
  cidb_grades?: string[] | string | null;
  bbbeeLevel?: string | null;
  provinces?: string[];
  sectors?: string[];
  keywords?: string[];
  capacityValueMaxRand?: number | null; // rand (UI), converted to cents
  csdNumber?: string | null;
  jvVisible?: boolean;
}

export interface NormalisedProfile {
  cidb_grades_json: string;       // JSON array, uppercased
  bbbee_level: number | null;
  provinces_json: string;         // JSON array of slugs
  sectors_json: string;           // JSON array of slugs
  keywords_json: string;          // JSON array, lowercased, max 10
  capacity_value_max: number | null; // cents
  csd_number: string | null;
  jv_visible: number;             // 0 | 1
}

export function normaliseProfileInput(raw: RawProfileInput): NormalisedProfile {
  const grades = Array.isArray(raw.cidb_grades)
    ? raw.cidb_grades
    : raw.cidb_grades ? [raw.cidb_grades] : [];

  const provinces = (raw.provinces ?? []).map(provinceSlug).filter((s): s is string => !!s);
  const sectors = (raw.sectors ?? []).map(sectorSlug).filter((s): s is string => !!s);
  const keywords = (raw.keywords ?? [])
    .map(k => k.trim().toLowerCase()).filter(Boolean).slice(0, 10);

  return {
    cidb_grades_json: JSON.stringify(grades.map(g => String(g).trim().toUpperCase()).filter(Boolean)),
    bbbee_level: bbbeeToLevel(raw.bbbeeLevel),
    provinces_json: JSON.stringify([...new Set(provinces)]),
    sectors_json: JSON.stringify([...new Set(sectors)]),
    keywords_json: JSON.stringify([...new Set(keywords)]),
    capacity_value_max: raw.capacityValueMaxRand != null ? Math.round(raw.capacityValueMaxRand * 100) : null,
    csd_number: raw.csdNumber?.trim() || null,
    jv_visible: raw.jvVisible ? 1 : 0,
  };
}
