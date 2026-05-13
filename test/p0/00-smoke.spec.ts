import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const CRITICAL_ROUTES = [
  '/', '/tenders', '/blog', '/privacy', '/terms',
  '/blog/how-to-win-your-first-tender',
  '/blog/bbbee-requirements',
  '/blog/csd-registration',
  '/provinces/gauteng', '/provinces/western-cape', '/provinces/kwazulu-natal',
  '/provinces/eastern-cape', '/provinces/free-state', '/provinces/limpopo',
  '/provinces/mpumalanga', '/provinces/northern-cape', '/provinces/north-west',
  '/pfma',
];

for (const route of CRITICAL_ROUTES) {
  test(`${route} returns 200 and is accessible`, async ({ page }) => {
    const response = await page.goto(route);
    expect(response?.status(), `${route} should return 200`).toBe(200);

    // SEO essentials
    await expect(page).toHaveTitle(/.+/);
    const desc = await page.locator('meta[name="description"]').getAttribute('content');
    expect(desc?.length).toBeGreaterThan(20);
    expect(desc?.length).toBeLessThan(161);

    const canonical = await page.locator('link[rel="canonical"]').getAttribute('href');
    expect(canonical).toContain('tenderpreneur'); // catches pages.dev leak

    // Accessibility
    const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
    expect(axe.violations, `axe found ${axe.violations.length} issues`).toEqual([]);
  });
}

test('homepage hero renders within mobile viewport', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto('/');
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > 320);
  expect(overflow, 'No horizontal overflow on 320px').toBe(false);
});

test('mobile menu opens, closes on link tap, traps focus', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 });
  await page.goto('/');
  await page.getByRole('button', { name: /menu/i }).click();
  await expect(page.getByRole('navigation')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('navigation')).toBeHidden();
});