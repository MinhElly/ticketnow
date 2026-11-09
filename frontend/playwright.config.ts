import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests',
  timeout: 180000,
  expect: { timeout: 15000 },
  use: {
    baseURL: process.env.TICKETNOW_TEST_URL || `http://localhost:${process.env.PORT || 3000}`,
    launchOptions: { executablePath: '/usr/bin/chromium', args: ['--no-sandbox'] },
    headless: true,
    viewport: { width: 1440, height: 1000 },
  },
})
