const { test, expect } = require('@playwright/test');

const PAGES = [
  { name: 'home', url: 'https://tenderpreneurs.pages.dev/' },
  { name: 'blog', url: 'https://tenderpreneurs.pages.dev/blog' },
  // add routes as they exist
];

const VIEWPORTS = [
  { name: 'mobile-small', width: 320, height: 568 },
  { name: 'mobile', width: 375, height: 667 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'desktop', width: 1280, height: 800 },
  { name: 'wide', width: 1920, height: 1080 },
];

for (const page of PAGES) {
  for (const vp of VIEWPORTS) {
    test(`${page.name} @ ${vp.name}`, async ({ page: browserPage }) => {
      await browserPage.setViewportSize({ width: vp.width, height: vp.height });
      await browserPage.goto(page.url, { waitUntil: 'networkidle' });
      
      // Screenshot for visual regression
      await expect(browserPage).toHaveScreenshot(`${page.name}-${vp.name}.png`, {
        fullPage: true,
        maxDiffPixelRatio: 0.01,
      });
      
      // Check no horizontal scroll (the §13.2 test)
      const hasHScroll = await browserPage.evaluate(() => 
        document.documentElement.scrollWidth > document.documentElement.clientWidth
      );
      expect(hasHScroll, `Horizontal scroll at ${vp.width}px`).toBe(false);
    });
  }
}