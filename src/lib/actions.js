'use server'
// Server actions. Identity always comes from Clerk on the server, never from arguments.
// Validation, field allowlists and query rules live in ./data.js; the database applies
// Row Level Security with the caller's Clerk session token (see ./client.js).

import { auth, currentUser } from '@clerk/nextjs/server'
import { createServerSupabaseClient } from './client'
import * as data from './data'

// Signed-in user id only; no Clerk Backend API request.
async function viewer () {
	const { userId } = await auth()
	return userId ? { id: userId } : null
}

// Writes that need the profile (username) load the full Clerk user.
async function author () {
	const user = await currentUser()
	if (!user) return null
	return {
		id: user.id,
		username: user.username ?? null,
		displayName: [user.firstName, user.lastName].filter(Boolean).join(' ') || user.username || 'Member',
		imageUrl: user.imageUrl ?? null,
	}
}

async function run (operation, getUser, action) {
	try {
		const user = await getUser()
		return await action({ client: createServerSupabaseClient(), user })
	} catch (error) {
		console.error(`[actions] ${operation} failed:`, error?.message)
		return data.failure('DB', 'The request could not be completed.')
	}
}

// Elements ==============

export async function addElement (input) {
	return run('addElement', author, ctx => data.createElement({ ...ctx, input }))
}

export default async function getElements (params) {
	return run('getElements', viewer, ctx => data.listElements({ ...ctx, params }))
}

/** Resolves to the element, null when it is missing or not visible, or { error }. */
export async function getElement (id, elementId) {
	const result = await run('getElement', viewer, ctx => data.getElementDetail({ ...ctx, id, elementId }))
	return result.error ? { error: result.error } : result.data
}

export async function getUserElements (userId, page = 1) {
	return run('getUserElements', viewer, ctx => data.listUserElements({ ...ctx, userId, page }))
}

export async function deleteElement (id) {
	return run('deleteElement', viewer, ctx => data.deleteElement({ ...ctx, id }))
}

// Likes ==============

export async function toggleLike (elementId) {
	return run('toggleLike', viewer, ctx => data.toggleElementLike({ ...ctx, elementId }))
}

export async function getUserLikes ({ page = 1 } = {}) {
	return run('getUserLikes', viewer, ctx => data.listUserLikes({ ...ctx, page }))
}

// Comments ==============

/** Resolves to { data: persistedComment } or { error }. */
export async function createComment (input) {
	return run('createComment', author, ctx => data.createComment({ ...ctx, input }))
}

export async function getComments (elementId) {
	return run('getComments', viewer, ctx => data.listComments({ ...ctx, elementId }))
}

export async function deleteComment (id) {
	return run('deleteComment', viewer, ctx => data.deleteComment({ ...ctx, id }))
}

export async function likeComment (id) {
	return run('likeComment', viewer, ctx => data.toggleCommentLike({ ...ctx, commentId: id }))
}
