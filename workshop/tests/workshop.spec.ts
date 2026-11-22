/**
 * End-to-end product flow against the real dev server and Durable Object
 * (`npx deepspace test run tests/workshop.spec.ts`). Two signed-in test
 * accounts (A, B) plus a signed-out browser:
 *
 *   A creates a draft that persists across reload → B and signed-out visitors
 *   cannot see it, and B's direct API writes against it are rejected → A
 *   publishes → a signed-out visitor finds it with a multiword search, filters
 *   and back/forward → B copies code and posts feedback → A sees it live and
 *   replies → B deletes their own new feedback immediately → B's direct write
 *   to A's reply is rejected → A unpublishes (B's open page loses it live) and
 *   republishes (feedback restored) → A deletes the component and its feedback
 *   is gone on the backend.
 *
 * No billable integration is called: notifications are not enabled for the
 * test accounts, and the review panel's states are exercised with the action
 * response mocked at the browser boundary.
 */
import { test, expect, loadAllTestAccounts } from 'deepspace/testing'
import type { Page, Response } from '@playwright/test'

const accounts = loadAllTestAccounts().length
test.skip(accounts < 2, `Needs 2 test accounts (found ${accounts}). Create them with \`npx deepspace test accounts create\`.`)

const RUN = Date.now().toString(36)
const TAG_A = `e2e${RUN}`
const TAG_B = `flow${RUN}`
const TITLE = `__test-${RUN}__ Workshop button`

type ActionReply = { status: number; body: { success?: boolean; code?: string; error?: string; data?: Record<string, unknown> } }

/**
 * Call a server action directly from the page, as an attacker would: with the
 * page's own session token (fetched the way the SDK does), or with none.
 */
async function directAction(page: Page, name: string, params: Record<string, unknown>, { withToken = true } = {}): Promise<ActionReply> {
  return page.evaluate(async ({ name, params, withToken }) => {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (withToken) {
      const tokenRes = await fetch('/api/auth/token', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' } })
      const { token } = (await tokenRes.json()) as { token?: string }
      if (!token) throw new Error('no session token')
      headers.Authorization = `Bearer ${token}`
    }
    const res = await fetch(`/api/actions/${name}`, { method: 'POST', headers, body: JSON.stringify(params) })
    let body = {}
    try {
      body = await res.json()
    } catch {
      body = {}
    }
    return { status: res.status, body }
  }, { name, params, withToken })
}

function actionResponse(page: Page, name: string): Promise<Response> {
  return page.waitForResponse((r) => r.url().endsWith(`/api/actions/${name}`) && r.request().method() === 'POST')
}

async function createDraft(page: Page): Promise<string> {
  await page.goto('/studio/new')
  await page.getByLabel('Title').fill(TITLE)
  await page.getByLabel('Tags (comma separated)').fill(`${TAG_A}, ${TAG_B}, rounded`)
  await page.getByTestId('editor-html').fill('<button class="b">Ship it</button>')
  await page.getByRole('tab', { name: 'css' }).click()
  await page.getByTestId('editor-css').fill('.b { border-radius: 999px; padding: 10px 20px; }')
  await page.getByRole('button', { name: /Save draft/ }).click()
  // Wait for the persisted id to replace "new" in the URL.
  await expect(page).toHaveURL(/\/studio\/(?!new$)[A-Za-z0-9_-]+$/, { timeout: 15_000 })
  const id = new URL(page.url()).pathname.split('/').pop()!
  expect(id).not.toBe('new')
  return id
}

async function postFeedback(page: Page, text: string): Promise<string> {
  const response = actionResponse(page, 'createFeedback')
  await page.getByLabel('Leave feedback').fill(text)
  await page.getByRole('button', { name: 'Post feedback' }).click()
  const body = (await (await response).json()) as { success: boolean; data?: { feedback: { recordId: string } } }
  expect(body.success, JSON.stringify(body)).toBe(true)
  return body.data!.feedback.recordId
}

test('two users: drafts, publishing, discovery, feedback, real-time, ownership, unpublish, delete', async ({ users, browser }) => {
  test.setTimeout(180_000)
  const [alice, bob] = await users(2)
  const anonymous = await (await browser.newContext()).newPage()

  // ── A: draft creation and persistence after refresh ────────────────────────
  const id = await createDraft(alice.page)
  await alice.page.reload()
  await expect(alice.page.getByLabel('Title')).toHaveValue(TITLE, { timeout: 15_000 })
  await expect(alice.page.getByTestId('editor-status')).toHaveText('Draft')

  // ── Drafts stay private ─────────────────────────────────────────────────────
  for (const page of [bob.page, anonymous]) {
    await page.goto(`/c/${id}`)
    await expect(page.getByText('Component not found')).toBeVisible({ timeout: 15_000 })
  }
  await bob.page.goto(`/studio/${id}`)
  await expect(bob.page.getByText('Component not found')).toBeVisible({ timeout: 15_000 })

  // ── The backend rejects B's direct writes against A's draft ─────────────────
  const hijack = { id, title: 'Hijacked', category: 'buttons', html: '<b>x</b>' }
  expect((await directAction(bob.page, 'saveComponent', hijack)).body).toMatchObject({ success: false, code: 'not_found' })
  expect((await directAction(bob.page, 'setComponentStatus', { id, status: 'published' })).body).toMatchObject({ success: false, code: 'not_found' })
  expect((await directAction(bob.page, 'deleteComponent', { id })).body).toMatchObject({ success: false, code: 'not_found' })
  expect((await directAction(bob.page, 'reviewComponent', { id })).body).toMatchObject({ success: false, code: 'not_found' })
  // Forged privileged fields are refused outright.
  expect((await directAction(bob.page, 'saveComponent', { ...hijack, id: undefined, ownerId: 'someone-else', status: 'published' })).body)
    .toMatchObject({ success: false, code: 'invalid_input' })
  // Without a session token the action route refuses the request.
  expect((await directAction(anonymous, 'deleteComponent', { id }, { withToken: false })).status).toBe(401)
  // A's draft is untouched.
  await alice.page.reload()
  await expect(alice.page.getByLabel('Title')).toHaveValue(TITLE, { timeout: 15_000 })

  // ── A publishes ─────────────────────────────────────────────────────────────
  await alice.page.getByRole('button', { name: 'Publish' }).click()
  await expect(alice.page).toHaveURL(new RegExp(`/c/${id}$`), { timeout: 15_000 })
  await expect(alice.page.getByTestId('owner-controls')).toBeVisible()

  // ── Signed-out discovery: multiword search, reload, filters, back/forward ──
  await anonymous.goto('/home')
  await anonymous.getByRole('searchbox', { name: 'Search components' }).fill(`${TAG_B} ${TAG_A}`)
  await anonymous.getByRole('button', { name: 'Apply' }).click()
  await expect(anonymous).toHaveURL(new RegExp(`q=${TAG_B}\\+${TAG_A}`))
  await expect(anonymous.getByTestId('component-card')).toHaveCount(1, { timeout: 15_000 })
  await anonymous.reload()
  await expect(anonymous.getByTestId('component-card')).toHaveCount(1, { timeout: 15_000 })
  await expect(anonymous.getByRole('searchbox', { name: 'Search components' })).toHaveValue(`${TAG_B} ${TAG_A}`)
  await anonymous.getByLabel('Category').selectOption('cards')
  await anonymous.getByRole('button', { name: 'Apply' }).click()
  await expect(anonymous.getByText('No matching components')).toBeVisible()
  await anonymous.goBack()
  await expect(anonymous.getByTestId('component-card')).toHaveCount(1)
  await expect(anonymous.getByLabel('Category')).toHaveValue('')
  await anonymous.goForward()
  await expect(anonymous.getByText('No matching components')).toBeVisible()
  await expect(anonymous.getByLabel('Category')).toHaveValue('cards')

  // ── B opens the shared URL, copies the code, and leaves feedback ───────────
  await bob.context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await bob.page.goto(`/c/${id}`)
  await expect(bob.page.getByTestId('component-title')).toHaveText(TITLE, { timeout: 15_000 })
  await expect(bob.page.getByTestId('owner-controls')).toHaveCount(0)
  await bob.page.getByRole('button', { name: 'Copy HTML' }).click()
  await expect.poll(() => bob.page.evaluate(() => navigator.clipboard.readText())).toContain('Ship it')
  const bobFeedbackId = await postFeedback(bob.page, 'Nice radius. Maybe add a focus style?')
  await expect(bob.page.getByTestId('feedback-item').filter({ hasText: 'Nice radius' })).toBeVisible()

  // ── A sees it live (no reload) and replies immediately ──────────────────────
  const aliceItem = alice.page.getByTestId('feedback-item').filter({ hasText: 'Nice radius' })
  await expect(aliceItem).toBeVisible({ timeout: 15_000 })
  await aliceItem.getByRole('button', { name: 'Reply' }).click()
  const replyResponse = actionResponse(alice.page, 'createFeedback')
  await alice.page.getByLabel(/Reply to/).fill('Good call, adding one.')
  await alice.page.getByRole('button', { name: 'Reply', exact: true }).last().click()
  const replyBody = (await (await replyResponse).json()) as { data: { feedback: { recordId: string } } }
  const aliceReplyId = replyBody.data.feedback.recordId
  await expect(bob.page.getByTestId('feedback-item').filter({ hasText: 'Good call' })).toBeVisible({ timeout: 15_000 })

  // ── B posts again and deletes it straight away (persisted id, no reload) ───
  await postFeedback(bob.page, 'Typo, ignore me')
  const typo = bob.page.getByTestId('feedback-item').filter({ hasText: 'Typo, ignore me' })
  await expect(typo.getByRole('button', { name: 'Delete feedback' })).toBeVisible({ timeout: 15_000 })
  await typo.getByRole('button', { name: 'Delete feedback' }).click()
  await bob.page.getByRole('button', { name: 'Delete', exact: true }).click()
  await expect(typo).toHaveCount(0)
  await expect(alice.page.getByTestId('feedback-item').filter({ hasText: 'Typo, ignore me' })).toHaveCount(0, { timeout: 15_000 })

  // ── Ownership on the backend: B cannot delete A's reply or touch A's component
  expect((await directAction(bob.page, 'deleteFeedback', { id: aliceReplyId })).body).toMatchObject({ success: false, code: 'not_found' })
  expect((await directAction(bob.page, 'setComponentStatus', { id, status: 'draft' })).body).toMatchObject({ success: false, code: 'not_found' })
  await expect(alice.page.getByTestId('feedback-item').filter({ hasText: 'Good call' })).toBeVisible()
  await expect(aliceItem.getByRole('button', { name: 'Delete feedback' })).toHaveCount(0)

  // ── A unpublishes: B's open page loses the component live ──────────────────
  await alice.page.getByRole('button', { name: 'Unpublish' }).click()
  await expect(alice.page.getByText('Draft · only you can see this')).toBeVisible({ timeout: 15_000 })
  await expect(bob.page.getByText('Component not found')).toBeVisible({ timeout: 15_000 })
  expect((await directAction(bob.page, 'createFeedback', { componentId: id, body: 'sneaky', clientRequestId: `req-${RUN}-hidden` })).body)
    .toMatchObject({ success: false, code: 'not_found' })
  await anonymous.goto(`/c/${id}`)
  await expect(anonymous.getByText('Component not found')).toBeVisible({ timeout: 15_000 })

  // ── A republishes: the component and its feedback return ───────────────────
  await alice.page.getByRole('button', { name: 'Publish' }).click()
  await expect(alice.page.getByTestId('owner-controls').getByRole('button', { name: 'Unpublish' })).toBeVisible({ timeout: 15_000 })
  await anonymous.reload()
  await expect(anonymous.getByTestId('component-title')).toHaveText(TITLE, { timeout: 15_000 })
  await expect(anonymous.getByTestId('feedback-item').filter({ hasText: 'Nice radius' })).toBeVisible({ timeout: 15_000 })
  await expect(anonymous.getByTestId('feedback-count')).toHaveText('2')

  // ── A deletes the component; its feedback is gone on the backend ───────────
  await alice.page.getByTestId('owner-controls').getByRole('button', { name: 'Delete' }).click()
  await alice.page.getByRole('button', { name: 'Delete', exact: true }).last().click()
  await expect(alice.page).toHaveURL(/\/studio$/, { timeout: 15_000 })
  // B's own feedback id no longer exists (cascade), and the component cannot receive new feedback.
  expect((await directAction(bob.page, 'deleteFeedback', { id: bobFeedbackId })).body).toMatchObject({ success: false, code: 'not_found' })
  expect((await directAction(bob.page, 'createFeedback', { componentId: id, body: 'late', clientRequestId: `req-${RUN}-gone` })).body)
    .toMatchObject({ success: false, code: 'not_found' })
  await anonymous.reload()
  await expect(anonymous.getByText('Component not found')).toBeVisible({ timeout: 15_000 })
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

  // Publishing still works while the review service is down.
  await alice.page.getByRole('button', { name: 'Publish' }).click()
  await expect(alice.page).toHaveURL(new RegExp(`/c/${id}$`), { timeout: 15_000 })

  // Clean up.
  await alice.page.getByTestId('owner-controls').getByRole('button', { name: 'Delete' }).click()
  await alice.page.getByRole('button', { name: 'Delete', exact: true }).last().click()
  await expect(alice.page).toHaveURL(/\/studio$/, { timeout: 15_000 })
})
