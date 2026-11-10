import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const target = new URL(process.env.PREVIEW_URL || 'http://127.0.0.1:3000');
assert(['127.0.0.1', 'localhost'].includes(target.hostname), 'Preview must use a local server');
await mkdir('artifacts', { recursive: true });
const browser = await chromium.launch();
const deadline = setTimeout(() => browser.close(), 45000);
deadline.unref();
let page;
const pageErrors = [];
try {
	const context = await browser.newContext({
		viewport: { width: 1440, height: 960 },
		colorScheme: 'dark',
		reducedMotion: 'reduce',
	});
	const blockedHosts = new Set();
	await context.route('**/*', route => {
		const url = new URL(route.request().url());
		if (url.origin === target.origin) return route.continue();
		blockedHosts.add(url.hostname);
		return route.abort();
	});
	page = await context.newPage();
	page.setDefaultTimeout(15000);
	page.setDefaultNavigationTimeout(15000);
	page.on('pageerror', error => pageErrors.push(error.message));
	const response = await page.goto(target.href, { waitUntil: 'domcontentloaded' });
	assert.equal(response.status(), 200);
	console.log('Homepage returned HTTP 200.');
	await page.getByRole('heading', { name: 'Interface Lab', exact: true }).waitFor({ state: 'visible' });
	console.log('Homepage heading is accessible.');
	await page.getByRole('link', { name: 'View Atoms', exact: true }).waitFor({ state: 'visible' });
	await page.getByRole('link', { name: 'View Molecules', exact: true }).waitFor({ state: 'visible' });
	await page.waitForFunction(() => document.fonts.status === 'loaded', null, { timeout: 10000 });
	await page.waitForTimeout(3000);
	await page.screenshot({ path: 'artifacts/homepage.png', animations: 'disabled', timeout: 10000 });
	await writeFile('artifacts/preview.json', JSON.stringify({
		recordedAt: new Date().toISOString(),
		commit: process.env.GITHUB_SHA || null,
		browser: browser.version(),
		viewport: { width: 1440, height: 960 },
		checks: ['HTTP 200', 'Accessible homepage heading', 'Accessible component-category links'],
		blockedHosts: [...blockedHosts],
		pageErrors,
		scope: 'Build-only homepage preview. Off-origin requests are blocked; live auth, database operations and publishing are not tested.',
	}, null, 2) + '\n');
	console.log('Homepage heading and links are accessible; preview saved under artifacts/.');
} catch (error) {
	if (page) {
		await page.screenshot({ path: 'artifacts/failure.png', timeout: 5000 }).catch(() => {});
	}
	await writeFile('artifacts/failure.json', JSON.stringify({ error: error.message, pageErrors }, null, 2));
	throw error;
} finally {
	clearTimeout(deadline);
	await browser.close();
}
