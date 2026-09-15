import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/p0',
  fullyParallel: true,
  retries: 1,
  reporter: [['html'], ['list']],
  use: {
    baseURL: process.env.BASE_URL || 'https://tenderpreneurs.co.za',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'desktop-chrome', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile-chrome', use: { ...devices['Pixel 7'] } },
    // mobile-safari (WebKit) omitted until the P0 workflow installs webkit browsers
  ],
});
