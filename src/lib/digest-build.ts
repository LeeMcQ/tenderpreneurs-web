/** Cap a daily digest: closing soon first, then new notices. */

export type DigestNotice = {
  id: string;
  title: string;
  closing_date?: string | null;
  first_seen_at?: string | null;
  procuring_entity?: string | null;
};

export type DigestBundle = {
  closing: DigestNotice[];
  fresh: DigestNotice[];
};

export function buildDigest(
  notices: DigestNotice[],
  opts: { now?: Date; closeDays?: number; cap?: number } = {},
): DigestBundle {
  const now = opts.now ?? new Date();
  const closeDays = opts.closeDays ?? 7;
  const cap = opts.cap ?? 8;
  const today = now.toISOString().slice(0, 10);

  const closing = notices
    .filter((n) => {
      if (!n.closing_date) return false;
      const d = n.closing_date.slice(0, 10);
      const diff = Math.round((new Date(d + 'T12:00:00').getTime() - now.getTime()) / 86400000);
      return diff >= 0 && diff <= closeDays;
    })
    .sort((a, b) => String(a.closing_date).localeCompare(String(b.closing_date)))
    .slice(0, cap);

  const used = new Set(closing.map((n) => n.id));
  const fresh = notices
    .filter((n) => !used.has(n.id) && n.first_seen_at && String(n.first_seen_at).slice(0, 10) >= today)
    .slice(0, Math.max(0, cap - closing.length));

  return { closing, fresh };
}

export function digestWhatsAppText(bundle: DigestBundle, site = 'https://tenderpreneurs.co.za'): string {
  const lines: string[] = ['Tenderpreneurs digest'];
  if (bundle.closing.length) {
    lines.push('', 'Closing soon:');
    for (const n of bundle.closing) {
      lines.push(`• ${n.title} (${n.closing_date?.slice(0, 10) || 'date?'}) ${site}/tenders/t/${n.id}`);
    }
  }
  if (bundle.fresh.length) {
    lines.push('', 'New today:');
    for (const n of bundle.fresh) {
      lines.push(`• ${n.title} ${site}/tenders/t/${n.id}`);
    }
  }
  if (!bundle.closing.length && !bundle.fresh.length) {
    lines.push('', 'No matching open notices in this window.');
  }
  return lines.join('\n');
}
