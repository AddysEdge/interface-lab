import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { chromium } from 'playwright';

const homepage = await readFile('.next/server/app/index.html');
const mime = {
	'.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml',
	'.png': 'image/png', '.jpg': 'image/jpeg', '.avif': 'image/avif',
	'.woff': 'font/woff', '.woff2': 'font/woff2',
};
const server = http.createServer(async (request, response) => {
	try {
		if (request.method !== 'GET') return response.writeHead(405).end();
		const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
		if (pathname === '/') {
			response.setHeader('Content-Type', 'text/html');
			return response.end(homepage);
		}
		const isChunk = pathname.startsWith('/_next/static/');
		const base = path.resolve(isChunk ? '.next/static' : 'public');
		const relative = isChunk ? pathname.slice('/_next/static/'.length) : pathname.slice(1);
		const file = path.resolve(base, relative);
		if (!file.startsWith(base + path.sep)) return response.writeHead(403).end();
		const bytes = await readFile(file);
		response.setHeader('Content-Type', mime[path.extname(file)] || 'application/octet-stream');
		response.end(bytes);
	} catch {
		response.writeHead(404).end();
	}
});
await new Promise((resolve, reject) => {
	server.once('error', reject);
	server.listen(0, '127.0.0.1', resolve);
});
await mkdir('artifacts', { recursive: true });
let browser;
let page;
let deadline;
try {
	browser = await chromium.launch();
	deadline = setTimeout(() => browser.close(), 45000);
	deadline.unref();
	const context = await browser.newContext({
		viewport: { width: 1440, height: 960 },
		colorScheme: 'light',
		javaScriptEnabled: false,
	});
	const origin = 'http://127.0.0.1:' + server.address().port;
	const blockedHosts = new Set();
	await context.route('**/*', route => {
		const url = new URL(route.request().url());
		if (url.origin === origin) return route.continue();
		blockedHosts.add(url.hostname);
		return route.abort();
	});
	page = await context.newPage();
	page.setDefaultTimeout(15000);
	page.setDefaultNavigationTimeout(15000);
	const response = await page.goto(origin, { waitUntil: 'load' });
	assert.equal(response.status(), 200);
	await page.getByRole('heading', { name: 'Interface Lab', exact: true }).waitFor({ state: 'visible' });
	await page.getByRole('link', { name: 'View Atoms', exact: true }).waitFor({ state: 'visible' });
	await page.getByRole('link', { name: 'View Molecules', exact: true }).waitFor({ state: 'visible' });
	await page.screenshot({ path: 'artifacts/homepage.png', animations: 'disabled', timeout: 10000 });
	await writeFile('artifacts/preview.json', JSON.stringify({
		recordedAt: new Date().toISOString(),
		commit: process.env.GITHUB_SHA || null,
		homepageSha256: createHash('sha256').update(homepage).digest('hex'),
		browser: browser.version(),
		viewport: { width: 1440, height: 960 },
		checks: ['Server-rendered HTML returned HTTP 200', 'Accessible homepage heading', 'Accessible component-category links'],
		blockedHosts: [...blockedHosts],
		javaScriptEnabled: false,
		scope: 'Generated server-rendered homepage and bundled assets only. JavaScript, hydration, live middleware, authentication, database operations and publishing are not tested.',
	}, null, 2) + '\n');
	console.log('Server-rendered heading and links are accessible; build preview saved.');
} catch (error) {
	if (page) await page.screenshot({ path: 'artifacts/failure.png', timeout: 5000 }).catch(() => {});
	await writeFile('artifacts/failure.json', JSON.stringify({ error: error.message }, null, 2));
	throw error;
} finally {
	clearTimeout(deadline);
	if (browser) await browser.close();
	await new Promise(resolve => server.close(resolve));
}
