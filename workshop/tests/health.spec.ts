/**
 * Health checks for a running app (local via `deepspace test run`, or deployed
 * via `npm run test:deployed`): phone-width layout, unexpected console errors
 * and failed requests, and recovery from a failed save.
 */
import { test, expect, loadAllTestAccounts } from 'deepspace/testing'
import type { Page } from '@playwright/test'

const PHONE = { width: 390, height: 844 }

/** Browser messages that are expected and not application failures. */
const EXPECTED_CONSOLE = [
  // The preview sandbox blocking scripts in user code is the isolation working.
  /Blocked script execution in 'about:srcdoc'/,
]

function watch(page: Page) {
  const consoleErrors: string[] = []
  const failedRequests: string[] = []
  page.on('console', (msg) => {
    if (msg.type() === 'error' && !EXPECTED_CONSOLE.some((re) => re.test(msg.text()))) consoleErrors.push(msg.text())
  })
  page.on('pageerror', (err) => consoleErrors.push(`pageerror: ${err.message}`))
  page.on('response', (res) => {
    const url = new URL(res.url())
    // A signed-out visitor's token probe answers 401 by design.
    const expected = res.status() === 401 && url.pathname === '/api/auth/token'
    if (res.status() >= 400 && url.origin === new URL(page.url() || res.url()).origin && !expected) {
      failedRequests.push(`${res.status()} ${res.request().method()} ${url.pathname}`)
    }
  })
  page.on('requestfailed', (req) => {
    const failure = req.failure()?.errorText ?? ''
    // Aborted fetches on navigation are not failures.
    if (!/ERR_ABORTED|NS_BINDING_ABORTED/.test(failure)) failedRequests.push(`failed ${req.method()} ${new URL(req.url()).pathname}: ${failure}`)
  })
  return { consoleErrors, failedRequests }
}

async function expectNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  expect(overflow, 'page should not scroll sideways at phone width').toBeLessThanOrEqual(1)
}

test('public pages work at phone width without errors', async ({ browser }) => {
  const context = await browser.newContext({ viewport: PHONE, isMobile: true, hasTouch: true })
  const page = await context.newPage()
  const seen = watch(page)

  await page.goto('/')
  await expect(page.getByTestId('static-landing')).toBeVisible()
  await expectNoHorizontalOverflow(page)

  await page.goto('/home')
  await expect(page.getByRole('heading', { name: 'Component library' })).toBeVisible({ timeout: 15_000 })
  await expect(page.getByTestId('results-summary')).not.toHaveText(/Loading/, { timeout: 15_000 })
  await expectNoHorizontalOverflow(page)
  await expect(page.getByRole('searchbox', { name: 'Search components' })).toBeVisible()

  const firstCard = page.getByTestId('component-card').first()
  if (await firstCard.count()) {
    await firstCard.getByRole('link').click()
    await expect(page.getByTestId('component-title')).toBeVisible({ timeout: 15_000 })
    await expect(page.getByTestId('component-preview')).toBeVisible()
    await expectNoHorizontalOverflow(page)
  }

  expect(seen.consoleErrors, seen.consoleErrors.join('\n')).toEqual([])
  expect(seen.failedRequests, seen.failedRequests.join('\n')).toEqual([])
  await context.close()
})

test('the editor works at phone width and recovers from a failed save', async ({ users }) => {
  test.skip(loadAllTestAccounts().length < 1, 'Needs a test account.')
  const [alice] = await users(1)
  await alice.page.setViewportSize(PHONE)
  const seen = watch(alice.page)

  await alice.page.goto('/studio/new')
  await expect(alice.page.getByLabel('Title')).toBeVisible({ timeout: 15_000 })
  await expect(alice.page.getByTestId('component-preview')).toBeVisible()
  await expectNoHorizontalOverflow(alice.page)

  const title = `__health-${Date.now().toString(36)}__ Phone check`
  await alice.page.getByLabel('Title').fill(title)

  // The first save fails at the network layer; the edit must survive.
  await alice.page.route('**/api/actions/saveComponent', (route) => route.abort('failed'))
  await alice.page.getByRole('button', { name: /Save draft/ }).click()
  await expect(alice.page.getByText('Not saved')).toBeVisible({ timeout: 15_000 })
  await expect(alice.page.getByLabel('Title')).toHaveValue(title)
  await expect(alice.page).toHaveURL(/\/studio\/new$/)

  // Retrying after the failure succeeds.
  await alice.page.unroute('**/api/actions/saveComponent')
  await alice.page.getByRole('button', { name: /Save draft/ }).click()
  await expect(alice.page).toHaveURL(/\/studio\/(?!new$)[A-Za-z0-9_-]+$/, { timeout: 15_000 })
  const id = new URL(alice.page.url()).pathname.split('/').pop()!

  // Clean up through the owner's page.
  await alice.page.goto(`/c/${id}`)
  await alice.page.getByTestId('owner-controls').getByRole('button', { name: 'Delete' }).click()
  await alice.page.getByRole('button', { name: 'Delete', exact: true }).last().click()
  await expect(alice.page).toHaveURL(/\/studio$/, { timeout: 15_000 })

  // The deliberate save failure (and the browser's console note about it) is the only failure.
  expect(seen.failedRequests.filter((r) => !r.includes('/api/actions/saveComponent'))).toEqual([])
  const unexpected = seen.consoleErrors.filter((e) => !/Failed to load resource: net::ERR_FAILED/.test(e))
  expect(unexpected, unexpected.join('\n')).toEqual([])
  expect(seen.consoleErrors.length).toBeLessThanOrEqual(1)
})
