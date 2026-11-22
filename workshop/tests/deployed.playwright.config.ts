import { defineConfig } from '@playwright/test'
import { chromiumLaunchOptions } from 'deepspace/testing'

/**
 * Run the end-to-end and health specs against a DEPLOYED app instead of the
 * local dev server: `npm run test:deployed` (override the target with
 * DEPLOYED_URL). Uses the same @deepspace.test accounts; the specs clean up
 * the components they create.
 */
export default defineConfig({
  testDir: '.',
  testMatch: ['workshop.spec.ts', 'health.spec.ts'],
  timeout: 60_000,
  retries: 0,
  workers: 1,
  use: {
    baseURL: process.env.DEPLOYED_URL ?? 'https://interfacelab.app.space',
    headless: true,
    launchOptions: chromiumLaunchOptions(),
  },
})
