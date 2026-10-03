function pickWorkPlaces(title: string, description: string): { places: Place[]; unresolved: boolean } {
  const titleNorm = norm(title);
  if (NATIONWIDE.test(titleNorm)) return { places: [], unresolved: false };
  const route = title.match(FROM_TO);
  if (route) {
    const dest = findPlaces(route[2]);
    if (dest.length) return { places: dest.slice(0, 1), unresolved: false };
  }
  const cued = `${title}\n${description}`.split(/[\n.;]/).map((s) => s.trim()).filter((s) => s.length > 8 && WORK_CUE.test(norm(s)) && !FALSE_CUE.test(norm(s)));
  const places = [...findPlaces(cued.join(' ')), ...findPlaces(`${title}\n${description}`)].filter((p, i, arr) => arr.findIndex((x) => x.slug === p.slug) === i).slice(0, 2);
  const namedSite = /\b(power station|substation|mine)\b/.test(titleNorm) || /\bat [a-z]{4,}/.test(titleNorm);
  return { places, unresolved: namedSite && places.length === 0 };
}
