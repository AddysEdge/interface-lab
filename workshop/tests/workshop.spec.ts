/**
 * End-to-end product flow against the real dev server and Durable Object
 * (`npx deepspace test run tests/workshop.spec.ts`). Two signed-in test
 * accounts plus an anonymous browser:
 *
 *   A creates a draft (persists across reload) → B and anonymous cannot see it
 *   → A publishes → anonymous finds it with a multiword search (tags in reverse
 *   order) → B copies code and posts feedback → A sees it live and replies
 *   immediately → B deletes their own new feedback without reloading → B has
 *   no owner controls and cannot open A's component in the editor.
 *
 * Integration calls are not made here (they bill real credits): the review
 * panel's success and failure states are exercised with the action response
 * mocked at the browser boundary. Server-side integration logic is covered by
 * src/server/actions.test.ts with tools.integration mocked.
 */
import { test, expect, loadAllTestAccounts } from 'deepspace/testing'
import type { Page } from '@playwright/test'

const accounts = loadAllTestAccounts().length
test.skip(accounts < 2, `Needs 2 test accounts (found ${accounts}). Create them with \`npx deepspace test accounts create\`.`)

const RUN = Date.now().toString(36)
const TAG_A = `e2e${RUN}`
const TAG_B = `flow${RUN}`
const TITLE = `__test-${RUN}__ Workshop button`

async function createDraft(page: Page): Promise<string> {
  await page.goto('/studio/new')
  await page.getByLabel('Title').fill(TITLE)
  await page.getByLabel('Tags (comma separated)').fill(`${TAG_A}, ${TAG_B}, rounded`)
  await page.getByTestId('editor-html').fill('<button class="b">Ship it</button>')
  await page.getByRole('tab', { name: 'css' }).click()
  await page.getByTestId('editor-css').fill('.b { border-radius: 999px; padding: 10px 20px; }')
  await page.getByRole('button', { name: /Save draft/ }).click()
  await expect(page).toHaveURL(/\/studio\/[A-Za-z0-9_-]+$/, { timeout: 15_000 })
  return new URL(page.url()).pathname.split('/').pop()!
}

test('two users: draft, publish, discover, feedback, reply, delete, ownership', async ({ users, browser }) => {
  const [alice, bob] = await users(2)
  const anonymous = await (await browser.newContext()).newPage()

  // A: draft creation and persistence after refresh.
  const id = await createDraft(alice.page)
  await alice.page.reload()
  await expect(alice.page.getByLabel('Title')).toHaveValue(TITLE, { timeout: 15_000 })
  await expect(alice.page.getByTestId('editor-status')).toHaveText('Draft')

  // Drafts stay private: B and anonymous get "not found" for the shareable URL.
  for (const page of [bob.page, anonymous]) {
    await page.goto(`/c/${id}`)
    await expect(page.getByText('Component not found')).toBeVisible({ timeout: 15_000 })
  }
  await bob.page.goto(`/studio/${id}`)
  await expect(bob.page.getByText('Component not found')).toBeVisible({ timeout: 15_000 })

  // A publishes.
  await alice.page.getByRole('button', { name: 'Publish' }).click()
  await expect(alice.page).toHaveURL(new RegExp(`/c/${id}$`), { timeout: 15_000 })
  await expect(alice.page.getByTestId('owner-controls')).toBeVisible()

  // Anonymous discovery: multiword search, terms in reverse order, survives reload.
  await anonymous.goto('/home')
  await anonymous.getByRole('searchbox', { name: 'Search components' }).fill(`${TAG_B} ${TAG_A}`)
  await anonymous.getByRole('button', { name: 'Apply' }).click()
  await expect(anonymous).toHaveURL(new RegExp(`q=${TAG_B}\\+${TAG_A}`))
  await expect(anonymous.getByTestId('component-card')).toHaveCount(1, { timeout: 15_000 })
  await anonymous.reload()
  await expect(anonymous.getByTestId('component-card')).toHaveCount(1, { timeout: 15_000 })
  await expect(anonymous.getByRole('searchbox', { name: 'Search components' })).toHaveValue(`${TAG_B} ${TAG_A}`)

  // Filter change → URL updates; browser back/forward keeps URL, inputs and results in sync.
  await anonymous.getByLabel('Category').selectOption('cards')
  await anonymous.getByRole('button', { name: 'Apply' }).click()
  await expect(anonymous.getByText('No matching components')).toBeVisible()
  await anonymous.goBack()
  await expect(anonymous.getByTestId('component-card')).toHaveCount(1)
  await expect(anonymous.getByLabel('Category')).toHaveValue('')
  await anonymous.goForward()
  await expect(anonymous.getByText('No matching components')).toBeVisible()
  await expect(anonymous.getByLabel('Category')).toHaveValue('cards')

  // B opens the shared URL, copies the code, and leaves feedback.
  await bob.context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await bob.page.goto(`/c/${id}`)
  await expect(bob.page.getByTestId('component-title')).toHaveText(TITLE, { timeout: 15_000 })
  await expect(bob.page.getByTestId('owner-controls')).toHaveCount(0)
  await bob.page.getByRole('button', { name: 'Copy HTML' }).click()
  await expect.poll(() => bob.page.evaluate(() => navigator.clipboard.readText())).toContain('Ship it')
  await bob.page.getByLabel('Leave feedback').fill('Nice radius. Maybe add a focus style?')
  await bob.page.getByRole('button', { name: 'Post feedback' }).click()
  await expect(bob.page.getByTestId('feedback-item').filter({ hasText: 'Nice radius' })).toBeVisible()

  // A sees it live (no reload) and replies immediately.
  const aliceItem = alice.page.getByTestId('feedback-item').filter({ hasText: 'Nice radius' })
  await expect(aliceItem).toBeVisible({ timeout: 15_000 })
  await aliceItem.getByRole('button', { name: 'Reply' }).click()
  await alice.page.getByLabel(/Reply to/).fill('Good call, adding one.')
  await alice.page.getByRole('button', { name: 'Reply', exact: true }).last().click()
  await expect(bob.page.getByTestId('feedback-item').filter({ hasText: 'Good call' })).toBeVisible({ timeout: 15_000 })

  // B posts again and deletes it straight away using the persisted id.
  await bob.page.getByLabel('Leave feedback').fill('Typo, ignore me')
  await bob.page.getByRole('button', { name: 'Post feedback' }).click()
  const typo = bob.page.getByTestId('feedback-item').filter({ hasText: 'Typo, ignore me' })
  await expect(typo.getByRole('button', { name: 'Delete feedback' })).toBeVisible({ timeout: 15_000 })
  await typo.getByRole('button', { name: 'Delete feedback' }).click()
  await bob.page.getByRole('button', { name: 'Delete', exact: true }).click()
  await expect(typo).toHaveCount(0)
  await expect(alice.page.getByTestId('feedback-item').filter({ hasText: 'Typo, ignore me' })).toHaveCount(0, { timeout: 15_000 })

  // A cannot delete B's feedback (no control is offered for it).
  await expect(aliceItem.getByRole('button', { name: 'Delete feedback' })).toHaveCount(0)

  // Clean up: A deletes the component (and its feedback).
  await alice.page.getByRole('button', { name: 'Delete' }).first().click()
  await alice.page.getByRole('button', { name: 'Delete', exact: true }).last().click()
  await expect(alice.page).toHaveURL(/\/studio$/, { timeout: 15_000 })
  await anonymous.close()
})

test('AI review panel: suggestions apply on request; failures are recoverable', async ({ users }) => {
  const [alice] = await users(1)
  const id = await createDraft(alice.page)

  // Failure first (mocked at the action boundary; no credits spent).
  await alice.page.route('**/api/actions/reviewComponent', (route) =>
    route.fulfill({ json: { success: false, code: 'integration_failed', error: 'The review service did not respond.' } }),
  )
  await alice.page.getByRole('button', { name: 'Suggest improvements' }).click()
  await expect(alice.page.getByRole('alert').filter({ hasText: 'did not respond' })).toBeVisible()
  await expect(alice.page.getByRole('button', { name: 'Try again' })).toBeVisible()
  // Editing and saving still work while the integration is down.
  await alice.page.getByLabel('Description').fill('Still editable')
  await alice.page.getByRole('button', { name: /Save draft/ }).click()
  await expect(alice.page.getByTestId('unsaved')).toHaveCount(0, { timeout: 15_000 })

  await alice.page.unroute('**/api/actions/reviewComponent')
  await alice.page.route('**/api/actions/reviewComponent', (route) =>
    route.fulfill({
      json: {
        success: true,
        data: { review: { description: 'A rounded pill button.', tags: ['pill', 'rounded'], accessibility: [{ issue: 'No focus style', suggestion: 'Add :focus-visible' }], docsQuery: 'focus-visible' } },
      },
    }),
  )
  await alice.page.getByRole('button', { name: 'Try again' }).click()
  await expect(alice.page.getByTestId('review-result')).toBeVisible()
  await alice.page.getByRole('button', { name: 'Use these tags' }).click()
  await expect(alice.page.getByLabel('Tags (comma separated)')).toHaveValue('pill, rounded')
  await expect(alice.page.getByTestId('unsaved')).toBeVisible() // applied locally, not saved until the creator saves

  // Clean up.
  await alice.page.goto(`/c/${id}`)
  await alice.page.getByRole('button', { name: 'Delete' }).first().click()
  await alice.page.getByRole('button', { name: 'Delete', exact: true }).last().click()
  await expect(alice.page).toHaveURL(/\/studio$/, { timeout: 15_000 })
})
