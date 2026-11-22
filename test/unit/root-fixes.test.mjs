// Regression tests for the Next.js app's review fixes (run: npm test).
// These are MOCKED checks: a fake Supabase query builder records the queries
// the data layer builds. They do not exercise a real database or RLS.
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { parseSearchTerms, applyTagSearch, escapeLikePattern } from '../../src/lib/search.js'
import { parseListState, buildListSearch, applyFilterChange, parsePage } from '../../src/lib/listState.js'
import { createTempId, isTempId, replaceComment, removeComment, restoreComment, canDeleteComment, canReplyTo } from '../../src/lib/commentState.js'
import { ATOM_CATEGORY_IDS, MOLECULE_CATEGORY_IDS } from '../../src/lib/categories.js'
import * as data from '../../src/lib/data.js'

/** Chainable fake of the supabase-js builder; resolves to `result` when awaited. */
function fakeClient (results = {}) {
	const calls = []
	const client = {
		calls,
		from (table) {
			const chain = { table, ops: [] }
			calls.push(chain)
			const builder = new Proxy({}, {
				get (_, prop) {
					if (prop === 'then') {
						const result = typeof results[table] === 'function' ? results[table](chain) : (results[table] ?? { data: [], error: null, count: 0 })
						return (resolve) => resolve(result)
					}
					return (...args) => { chain.ops.push([prop, ...args]); return builder }
				},
			})
			return builder
		},
	}
	return client
}

const alice = { id: 'user_alice', username: 'alice', displayName: 'Alice A', imageUrl: 'https://img.clerk.com/a' }

describe('multiword search', () => {
	test('"blue rounded" becomes two independent case-insensitive filters', () => {
		const terms = parseSearchTerms('Blue   rounded')
		assert.deepEqual(terms, ['blue', 'rounded'])
		const client = fakeClient()
		applyTagSearch(client.from('elements'), terms)
		assert.deepEqual(client.calls[0].ops, [['ilike', 'tags', '%blue%'], ['ilike', 'tags', '%rounded%']])
	})

	test('wildcards and separators cannot leak into patterns', () => {
		assert.deepEqual(parseSearchTerms('50%_off*, a\\b'), ['50off', 'ab'])
		assert.equal(escapeLikePattern('a%b_c\\'), 'a\\%b\\_c\\\\')
	})

	test('listElements sends one filter per term, never a joined array', async () => {
		const client = fakeClient({ elements: { data: [], error: null, count: 0 } })
		const res = await data.listElements({ client, user: null, params: { elementId: 'buttons', query: 'blue rounded', page: 1 } })
		assert.equal(res.error, undefined)
		const ilikes = client.calls[0].ops.filter(([op]) => op === 'ilike')
		assert.deepEqual(ilikes, [['ilike', 'tags', '%blue%'], ['ilike', 'tags', '%rounded%']])
		assert.ok(!JSON.stringify(client.calls).includes('blue,rounded'))
	})
})

describe('pagination and URL state', () => {
	test('page links keep q, style and sort', () => {
		const state = parseListState(new URLSearchParams('q=blue rounded&style=tailwind&sort=created_at&page=2'))
		assert.equal(buildListSearch({ ...state, page: 3 }), 'q=blue+rounded&style=tailwind&sort=created_at&page=3')
	})

	test('search, style or sort changes reset to page 1', () => {
		const current = { q: 'blue', style: 'all', sort: 'likes', page: 4 }
		assert.equal(applyFilterChange(current, { q: 'red' }).page, 1)
		assert.equal(applyFilterChange(current, { style: 'tailwind' }).page, 1)
		assert.equal(applyFilterChange(current, { sort: 'created_at' }).page, 1)
		assert.equal(applyFilterChange(current, { q: 'blue' }).page, 4)
	})

	test('malformed page parameters fall back to 1 and are validated server-side', async () => {
		for (const bad of ['abc', '-1', '0', '1.5', '99999', '']) assert.equal(parsePage(bad), 1)
		const client = fakeClient()
		const res = await data.listElements({ client, user: null, params: { elementId: 'buttons', page: 'abc' } })
		assert.equal(res.code, 'VALIDATION')
		assert.equal(client.calls.length, 0)
	})

	test('unknown sort columns and categories are rejected before querying', async () => {
		const client = fakeClient()
		assert.equal((await data.listElements({ client, user: null, params: { elementId: 'buttons', sort: 'html' } })).code, 'VALIDATION')
		assert.equal((await data.listElements({ client, user: null, params: { elementId: 'nope' } })).code, 'VALIDATION')
		assert.equal(client.calls.length, 0)
	})
})

describe('publishing validation', () => {
	const submission = { element_id: 'buttons', html: '<button>Go</button>', css: '', js: '', use_tailwind: false, tags: ['Blue', 'rounded'] }

	test('unauthenticated writes get an explicit error', async () => {
		const res = await data.createElement({ client: fakeClient(), user: null, input: submission })
		assert.equal(res.code, 'UNAUTHENTICATED')
		assert.match(res.error, /sign in/i)
	})

	test('published, likes and identity fields are rejected, not stored', async () => {
		for (const extra of [{ published: true }, { likes: 99 }, { user_id: 'user_bob' }, { username: 'bob' }]) {
			const client = fakeClient()
			const res = await data.createElement({ client, user: alice, input: { ...submission, ...extra } })
			assert.equal(res.code, 'VALIDATION', JSON.stringify(extra))
			assert.equal(client.calls.length, 0)
		}
	})

	test('the insert carries only allowlisted fields plus server-derived identity', async () => {
		const client = fakeClient({ elements: (chain) => chain.ops.some(([op]) => op === 'insert')
			? { data: { id: 1 }, error: null }
			: { count: 0, error: null } })
		const res = await data.createElement({ client, user: alice, input: submission })
		assert.equal(res.error, undefined)
		const insert = client.calls.flatMap((c) => c.ops).find(([op]) => op === 'insert')[1]
		assert.deepEqual(Object.keys(insert).sort(), ['credits_link', 'credits_name', 'css', 'element_id', 'html', 'js', 'tags', 'use_tailwind', 'user_avatar', 'user_id', 'username'].sort())
		assert.equal(insert.user_id, 'user_alice')
		assert.equal(insert.tags, 'blue,rounded')
		assert.ok(!('published' in insert) && !('likes' in insert))
	})

	test('submission limit and attribution rules', async () => {
		const full = fakeClient({ elements: { count: 10, error: null } })
		assert.equal((await data.createElement({ client: full, user: alice, input: submission })).code, 'LIMIT')
		const badLink = await data.createElement({ client: fakeClient(), user: alice, input: { ...submission, credits_name: 'shadcn', credits_link: 'javascript:alert(1)' } })
		assert.equal(badLink.code, 'VALIDATION')
		const halfCredit = await data.createElement({ client: fakeClient(), user: alice, input: { ...submission, credits_name: 'shadcn' } })
		assert.equal(halfCredit.code, 'VALIDATION')
		const badCategory = await data.createElement({ client: fakeClient(), user: alice, input: { ...submission, element_id: 'carousels' } })
		assert.equal(badCategory.code, 'VALIDATION')
	})
})

describe('comments with persisted ids', () => {
	test('createComment returns the persisted row and saves ownership as user_id', async () => {
		const row = { id: 42, content: 'hi', user_id: 'user_alice', parent_id: null }
		const client = fakeClient({ comments: { data: row, error: null } })
		const res = await data.createComment({ client, user: alice, input: { comment: ' hi ', element_id: 7, parent_id: null } })
		assert.deepEqual(res.data, row)
		const ops = client.calls[0].ops
		const insert = ops.find(([op]) => op === 'insert')[1]
		assert.equal(insert.user_id, 'user_alice')
		assert.equal(insert.content, 'hi')
		assert.ok(ops.some(([op]) => op === 'select') && ops.some(([op]) => op === 'single'))
	})

	test('the optimistic comment is replaced and becomes immediately actionable', () => {
		const temp = createTempId()
		assert.ok(isTempId(temp))
		let list = [{ id: temp, user_id: 'user_alice', parent_id: null, creating: true }]
		assert.equal(canReplyTo(list[0]), false)
		assert.equal(canDeleteComment(list[0], 'user_alice'), false)
		list = replaceComment(list, temp, { id: 42, user_id: 'user_alice', parent_id: null })
		assert.equal(list[0].id, 42)
		assert.equal(canReplyTo(list[0]), true)
		assert.equal(canDeleteComment(list[0], 'user_alice'), true)
		assert.equal(canDeleteComment(list[0], 'user_bob'), false)
	})

	test('temporary ids do not collide and failed deletes restore without losing other changes', () => {
		const ids = new Set(Array.from({ length: 500 }, () => createTempId()))
		assert.equal(ids.size, 500)
		const a = { id: 1 }; const b = { id: 2 }
		const afterDelete = removeComment([a, b], 1)
		assert.deepEqual(restoreComment([...afterDelete, { id: 3 }], a).map((c) => c.id), [2, 3, 1])
	})

	test('deleteComment filters by the caller and reports a missing row', async () => {
		const client = fakeClient({ comments: { data: [], error: null } })
		const res = await data.deleteComment({ client, user: alice, id: 9 })
		assert.equal(res.code, 'NOT_FOUND')
		assert.ok(client.calls[0].ops.some(([op, col, val]) => op === 'eq' && col === 'user_id' && val === 'user_alice'))
	})
})

test('category ids match the UI definitions in conts.js', () => {
	const source = readFileSync(new URL('../../src/lib/conts.js', import.meta.url), 'utf8')
	const atoms = source.slice(source.indexOf('export const Atoms'), source.indexOf('export const Molecules'))
	const molecules = source.slice(source.indexOf('export const Molecules'), source.indexOf('export const rules'))
	const ids = (block) => [...block.matchAll(/^\t\tid: '([^']+)'/gm)].map((m) => m[1])
	assert.deepEqual(ids(atoms), [...ATOM_CATEGORY_IDS])
	assert.deepEqual(ids(molecules), [...MOLECULE_CATEGORY_IDS])
})
