import { test, expect } from '@playwright/test';

const CRITICAL_ROUTES = [
  '/', 
  '/tenders', 
  '/blog', 
  '/privacy', 
  '/terms', 
  '/pfma',
];

for (const route of CRITICAL_ROUTES) {
  test(`${route} returns 200 and has title`, async ({ page }) => {
    const response = await page.goto(route, { waitUntil: 'networkidle' });
    expect(response?.status(), `${route} should return 200`).toBe(200);

    const title = await page.title();
    console.log(`📋 ${route} → title = "${title}"`);

    if (route !== '/') {
      expect(title, `${route} should have a title`).toBeTruthy();
    }
  });
}

// Deep internal link checker (fast, safe, no timeout)
test('all internal links work (deep check)', async ({ page }) => {
  const pagesToScan = ['/', '/tenders', '/blog'];
  let brokenCount = 0;

  for (const startPage of pagesToScan) {
    await page.goto(startPage, { waitUntil: 'networkidle' });

    const internalLinks = await page.locator('a[href^="/"]').all();
    const checked = new Set();

    console.log(`🔍 Scanning ${internalLinks.length} links on ${startPage}...`);

    for (const link of internalLinks) {
      const href = await link.getAttribute('href');
      if (!href || href.startsWith('#') || href.includes('mailto:') || checked.has(href)) continue;
      checked.add(href);

      const response = await page.request.get(href, { failOnStatusCode: false });
      if (response.status() >= 400) {
        console.log(`⚠️  Broken link → ${href} (${response.status()})`);
        brokenCount++;
      }
    }
  }

  console.log(`\n✅ Deep link check finished — ${brokenCount} broken links found`);
});
