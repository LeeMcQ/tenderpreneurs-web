/** Plain-English extract from a notice. No invented numbers. */

export type ExtractInput = {
  title?: string | null;
  description?: string | null;
  procuring_entity?: string | null;
  closing_date?: string | null;
  closing_time?: string | null;
  briefing_date?: string | null;
  briefing_compulsory?: number | boolean | null;
  briefing_location?: string | null;
  cidb_grade?: string | null;
  estimated_value?: number | null;
  evaluation_notes?: string | null;
};

export type PlainExtract = {
  buy: string;
  must: string[];
  close: string;
  briefing: string;
  cidb: string;
  preference: string;
};

function firstSentence(text: string, max = 180): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  const m = clean.match(/^(.{20,180}?[.!?])\s/);
  if (m) return m[1];
  return clean.slice(0, max) + (clean.length > max ? '…' : '');
}

function prefFrom(text: string): string {
  const t = text.toLowerCase();
  if (/\b90\s*\/\s*10\b/.test(t) || /\b90\/10\b/.test(t)) return '90/10 preference system mentioned.';
  if (/\b80\s*\/\s*20\b/.test(t) || /\b80\/20\b/.test(t)) return '80/20 preference system mentioned.';
  if (/specific goals|b-?bbee|pppfa/.test(t)) return 'Preference / specific goals mentioned — read the pack.';
  return 'Preference system not recovered from this row.';
}

export function plainExtract(input: ExtractInput): PlainExtract {
  const blob = [input.title, input.description, input.evaluation_notes].filter(Boolean).join(' ');
  const buy = input.description && String(input.description).trim().length >= 20
    ? firstSentence(String(input.description))
    : input.title
      ? String(input.title).trim()
      : 'Scope not published on this row.';

  const must: string[] = [];
  if (input.briefing_compulsory) must.push('Compulsory briefing — miss it and you are out.');
  if (input.cidb_grade) must.push(`CIDB ${input.cidb_grade} stated on the notice.`);
  if (/csd|central supplier/i.test(blob)) must.push('CSD registration is referenced.');
  if (/tax (pin|clearance|compliance)|tcs pin/i.test(blob)) must.push('Tax compliance / TCS PIN is referenced.');
  if (/compulsory|mandatory/i.test(blob) && must.length < 4) must.push('Mandatory items are referenced — open the official pack.');
  if (!must.length) must.push('No extra hard gates recovered beyond dates and official link.');

  const close = input.closing_date
    ? `Closes ${input.closing_date}${input.closing_time ? ` at ${input.closing_time} SAST` : ''}.`
    : 'No closing date on this row.';

  const briefing = input.briefing_date
    ? `${input.briefing_compulsory ? 'Compulsory' : 'Optional'} briefing ${input.briefing_date}${input.briefing_location ? ` · ${input.briefing_location}` : ''}.`
    : 'No briefing published.';

  const cidb = input.cidb_grade
    ? `Notice asks for ${input.cidb_grade}.`
    : 'No CIDB class on this notice.';

  return { buy, must, close, briefing, cidb, preference: prefFrom(blob) };
}
