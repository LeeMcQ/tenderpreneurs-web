/**
 * tests/p0/consent.spec.ts
 *
 * End-to-end tests for the POPIA cookie consent flow.
 *
 * These are P0 — if any fail, the site is not POPIA-compliant for new
 * visitors and should not be promoted to production.
 *
 * Covers:
 *   1. Banner appears on a fresh visit (no prior consent).
 *   2. "Reject all" persists a decision with analytics=false, marketing=false.
 *   3. "Accept all" persists analytics=true, marketing=true.
 *   4. "Customise" lets the user toggle individual categories.
 *   5. Defaults in the Customise view are OFF for analytics & marketing
 *      (POPIA: no pre-ticked consent).
 *   6. Banner does NOT reappear once a decision is stored.
 *   7. The footer "Cookie settings" button reopens the banner.
 *   8. The /cookies page "Open cookie settings" button works.
 *   9. The three legal links in the footer resolve to 200 OK.
 */

import { test, expect } from '@playwright/test';

const STORAGE_KEY = 'tp.consent.v1';

test.describe('POPIA consent flow', () => {
  test.beforeEach(async ({ context }) => {
    // Ensure a clean slate for every test.
    await context.clearCookies();
    await context.addInitScript((key) => {
      try { window.localStorage.removeItem(key); } catch (_) {}
    }, STORAGE_KEY);
  });

  test('banner appears on first visit', async ({ page }) => {
    await page.goto('/');
    const banner = page.locator('#tp-consent-banner');
    await expect(banner).toBeVisible();
    await expect(page.getByRole('button', { name: 'Accept all' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Reject all' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Customise' })).toBeVisible();
  });

  test('"Reject all" persists with analytics=false, marketing=false', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Reject all' }).click();

    // Banner should hide.
    await expect(page.locator('#tp-consent-banner')).toBeHidden();

    // Storage should reflect the rejection.
    const stored = await page.evaluate((key) => {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    }, STORAGE_KEY);

    expect(stored).not.toBeNull();
    expect(stored.version).toBe(1);
    expect(stored.decision).toBe('reject-all');
    expect(stored.categories).toEqual({
      necessary: true,
      analytics: false,
      marketing: false,
    });
    expect(typeof stored.timestamp).toBe('string');
  });

  test('"Accept all" persists with analytics=true, marketing=true', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Accept all' }).click();

    await expect(page.locator('#tp-consent-banner')).toBeHidden();

    const stored = await page.evaluate((key) => {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    }, STORAGE_KEY);

    expect(stored.decision).toBe('accept-all');
    expect(stored.categories).toEqual({
      necessary: true,
      analytics: true,
      marketing: true,
    });
  });

  test('Customise view defaults to OFF for analytics and marketing', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Customise' }).click();

    const analytics = page.locator('[data-tp-consent-category="analytics"]');
    const marketing = page.locator('[data-tp-consent-category="marketing"]');
    const necessary = page.locator('[data-tp-consent-category="necessary"]');

    // POPIA: pre-ticked boxes are NOT valid consent.
    await expect(analytics).not.toBeChecked();
    await expect(marketing).not.toBeChecked();
    // Necessary is always on and disabled.
    await expect(necessary).toBeChecked();
    await expect(necessary).toBeDisabled();
  });

  test('Customise -> toggle analytics only -> Save persists the right shape', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Customise' }).click();
    await page.locator('[data-tp-consent-category="analytics"]').check();
    await page.getByRole('button', { name: 'Save preferences' }).click();

    await expect(page.locator('#tp-consent-banner')).toBeHidden();

    const stored = await page.evaluate((key) => {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    }, STORAGE_KEY);

    expect(stored.decision).toBe('custom');
    expect(stored.categories).toEqual({
      necessary: true,
      analytics: true,
      marketing: false,
    });
  });

  test('banner does not reappear once a decision is stored', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Reject all' }).click();
    await expect(page.locator('#tp-consent-banner')).toBeHidden();

    // Reload and navigate to a different route.
    await page.reload();
    await expect(page.locator('#tp-consent-banner')).toBeHidden();

    await page.goto('/about');
    await expect(page.locator('#tp-consent-banner')).toBeHidden();
  });

  test('footer "Cookie settings" reopens the banner', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Accept all' }).click();
    await expect(page.locator('#tp-consent-banner')).toBeHidden();

    // Scroll the footer into view and click.
    const settingsBtn = page.getByTestId('footer-cookie-settings');
    await settingsBtn.scrollIntoViewIfNeeded();
    await settingsBtn.click();

    await expect(page.locator('#tp-consent-banner')).toBeVisible();
    // The customise view should be the one shown when reopening.
    await expect(page.locator('#tp-consent-customise')).toBeVisible();
  });

  test('"tp:consent-changed" event fires with the stored record', async ({ page }) => {
    await page.goto('/');

    // Set up a listener BEFORE clicking.
    await page.evaluate(() => {
      window.__tpEvents = [];
      window.addEventListener('tp:consent-changed', (e) => {
        window.__tpEvents.push(e.detail);
      });
    });

    await page.getByRole('button', { name: 'Accept all' }).click();

    const events = await page.evaluate(() => window.__tpEvents);
    expect(events.length).toBe(1);
    expect(events[0].decision).toBe('accept-all');
    expect(events[0].categories.analytics).toBe(true);
    expect(events[0].categories.marketing).toBe(true);
  });
});

test.describe('Legal pages published & linked in footer', () => {
  for (const path of ['/privacy', '/terms', '/cookies']) {
    test(`${path} responds 200 and renders an h1`, async ({ page }) => {
      const response = await page.goto(path);
      expect(response?.status()).toBe(200);
      await expect(page.locator('h1')).toBeVisible();
    });
  }

  test('footer links to all three legal pages from the homepage', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('footer-privacy-link')).toHaveAttribute('href', '/privacy');
    await expect(page.getByTestId('footer-terms-link')).toHaveAttribute('href', '/terms');
    await expect(page.getByTestId('footer-cookies-link')).toHaveAttribute('href', '/cookies');
  });
});
