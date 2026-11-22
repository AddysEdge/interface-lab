import { defineConfig } from '@playwright/test'
import { chromiumLaunchOptions } from 'deepspace/testing'

/**
 * Browser test of the preview sandbox. Self-contained: it serves its own
 * parent page through request interception, so it needs no app server,
 * login or network access. Run with `npm run test:isolation`.
 */
export default defineConfig({
  testDir: '.',
  testMatch: '*.spec.ts',
  timeout: 30_000,
  retries: 0,
  use: { headless: true, launchOptions: chromiumLaunchOptions() },
})
