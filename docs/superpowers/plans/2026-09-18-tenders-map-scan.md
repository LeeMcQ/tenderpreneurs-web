# Tenders scan + province-to-town map

Shipped on existing Astro / D1 stack.

- Resolve town only when title, entity, or briefing names it.
- `/api/tenders/geo` feeds choropleth + town dots.
- `/tenders` paper workspace, density strip, sticky desktop map.
- Search 503 when D1 is unbound instead of an uncaught throw.
- `/sw.js` registers from BaseLayout for later TWA/APK wrap.
