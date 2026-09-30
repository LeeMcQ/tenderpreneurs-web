/** Hard go / no-go gates. No percentage. */

export type Gate = {
  id: string;
  ok: boolean;
  label: string;
  detail: string;
};

export type NogoInput = {
  closing_date?: string | null;
  closing_time?: string | null;
  briefing_date?: string | null;
  briefing_compulsory?: number | boolean | null;
  cidb_grade?: string | null;
  source_url?: string | null;
  documents_json?: string | null;
  description?: string | null;
  title?: string | null;
  held_cidb?: string[] | null;
};

export type NogoResult = {
  verdict: 'no-go' | 'risk' | 'ready';
  gates: Gate[];
};

function daysUntil(iso: string | null | undefined, now = new Date()): number | null {
  if (!iso) return null;
  const d = new Date(iso.slice(0, 10) + 'T12:00:00');
  if (Number.isNaN(d.getTime())) return null;
  return Math.round((d.getTime() - now.getTime()) / 86400000);
}

export function nogo(input: NogoInput, now = new Date()): NogoResult {
  const closeDays = daysUntil(input.closing_date, now);
  const briefDays = daysUntil(input.briefing_date, now);
  const hasDocs = !!(input.documents_json && input.documents_json.length > 4);
  const hasOfficial = !!(input.source_url && /^https?:\/\//i.test(input.source_url));
  const thin = !input.description || String(input.description).trim().length < 40;

  const cidbOk = (() => {
    if (!input.cidb_grade) return true;
    if (!input.held_cidb || !input.held_cidb.length) return true;
    const req = String(input.cidb_grade).toUpperCase();
    return input.held_cidb.some((g) => String(g).toUpperCase().includes(req.replace(/\s/g, '')) || req.includes(String(g).toUpperCase().replace(/\s/g, '')));
  })();

  const gates: Gate[] = [
    {
      id: 'closing',
      ok: closeDays !== null && closeDays >= 0,
      label: 'Closing date',
      detail:
        closeDays == null
          ? 'No closing date published — treat as incomplete.'
          : closeDays < 0
            ? 'This notice has already closed.'
            : `Closes in ${closeDays} day${closeDays === 1 ? '' : 's'}.`,
    },
    {
      id: 'briefing',
      ok: !(input.briefing_compulsory && briefDays !== null && briefDays < 0),
      label: 'Compulsory briefing',
      detail: input.briefing_compulsory
        ? briefDays == null
          ? 'Marked compulsory but no date published.'
          : briefDays < 0
            ? 'Compulsory briefing date has passed.'
            : `Compulsory briefing in ${briefDays} day${briefDays === 1 ? '' : 's'}.`
        : input.briefing_date
          ? 'Optional briefing published.'
          : 'No briefing published.',
    },
    {
      id: 'cidb',
      ok: cidbOk,
      label: 'CIDB class',
      detail: input.cidb_grade
        ? cidbOk
          ? `Notice asks for ${input.cidb_grade}.`
          : `Notice asks for ${input.cidb_grade}; your saved grades do not match.`
        : 'No CIDB class on the notice.',
    },
    {
      id: 'official',
      ok: hasOfficial,
      label: 'Official source',
      detail: hasOfficial ? 'Official notice link is present.' : 'No official URL on this row.',
    },
    {
      id: 'pack',
      ok: hasDocs && !thin,
      label: 'Bid pack / scope',
      detail: thin
        ? 'Scope text is thin. Read the official pack before you bid.'
        : hasDocs
          ? 'Documents listed on this notice.'
          : 'No document links recovered — open the official notice.',
    },
  ];

  const hardFail = gates.filter((g) => g.id === 'closing' || g.id === 'briefing' || g.id === 'cidb').some((g) => !g.ok);
  const risk = gates.some((g) => !g.ok);
  return { verdict: hardFail ? 'no-go' : risk ? 'risk' : 'ready', gates };
}
