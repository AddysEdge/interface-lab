/**
 * Sample library, clearly marked (isSample = true, author "InterfaceLab
 * samples"). Several snippets are adapted from InterfaceLab's original
 * example code (src/lib/exampleCode.js in the repository root).
 *
 * Seeding is an owner-only server action and is idempotent.
 */
import type { ActionHandler } from 'deepspace/worker'
import type { Env } from '../../worker'
import type { CategoryId } from '../shared/categories'
import type { ComponentData } from '../shared/types'
import { fail, guard, isSignedIn, must } from './common'

export const SAMPLE_AUTHOR = 'InterfaceLab samples'

interface Sample {
  title: string
  description: string
  category: CategoryId
  tags: string[]
  html: string
  css: string
}

export const SAMPLES: Sample[] = [
  {
    title: 'Pill button',
    description: 'A bold primary button with hover and press feedback and a visible keyboard focus ring.',
    category: 'buttons',
    tags: ['purple', 'rounded', 'primary', 'animated'],
    html: '<button class="btn" type="button">Get started</button>',
    css: `.btn {
  background: oklch(62.7% 0.265 303.9);
  color: #fff;
  font: 600 16px/1 system-ui, sans-serif;
  padding: 14px 36px;
  border: 0;
  border-radius: 999px;
  cursor: pointer;
  transition: scale .15s ease, box-shadow .15s ease;
}
.btn:hover { scale: 1.05; box-shadow: 0 8px 24px oklch(62.7% 0.265 303.9 / .35); }
.btn:active { scale: .97; }
.btn:focus-visible { outline: 3px solid #1d4ed8; outline-offset: 3px; }`,
  },
  {
    title: 'Ghost icon button',
    description: 'An outlined button with an inline SVG icon and accessible label.',
    category: 'buttons',
    tags: ['outline', 'icon', 'blue', 'rounded'],
    html: `<button class="ghost" type="button">
  <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg>
  New project
</button>`,
    css: `.ghost {
  display: inline-flex; align-items: center; gap: 8px;
  padding: 10px 18px; border-radius: 10px;
  border: 2px solid #2563eb; background: transparent; color: #1d4ed8;
  font: 600 15px system-ui, sans-serif; cursor: pointer;
}
.ghost:hover { background: #eff6ff; }
.ghost:focus-visible { outline: 3px solid #1d4ed8; outline-offset: 2px; }`,
  },
  {
    title: 'Profile card',
    description: 'A compact profile card with a gradient avatar, role and two actions.',
    category: 'cards',
    tags: ['profile', 'gradient', 'rounded', 'shadow'],
    html: `<article class="card">
  <div class="avatar" aria-hidden="true">AR</div>
  <h2>Ada Rivera</h2>
  <p>Design systems engineer</p>
  <div class="actions"><a href="#">Follow</a><a href="#" class="secondary">Message</a></div>
</article>`,
    css: `.card { width: 260px; padding: 24px; border-radius: 18px; background: #fff; text-align: center;
  box-shadow: 0 10px 30px rgb(15 23 42 / .12); font-family: system-ui, sans-serif; }
.avatar { width: 64px; height: 64px; margin: 0 auto 12px; border-radius: 50%; display: grid; place-items: center;
  color: #fff; font-weight: 700; background: linear-gradient(135deg, #6366f1, #a855f7); }
h2 { margin: 0; font-size: 18px; color: #0f172a; }
p { margin: 4px 0 16px; color: #475569; font-size: 14px; }
.actions { display: flex; gap: 8px; justify-content: center; }
.actions a { padding: 8px 14px; border-radius: 8px; background: #4f46e5; color: #fff; text-decoration: none; font-size: 14px; }
.actions a.secondary { background: #eef2ff; color: #3730a3; }`,
  },
  {
    title: 'Floating label input',
    description: 'A text field whose label floats above the value, adapted from the InterfaceLab input example.',
    category: 'forms',
    tags: ['input', 'label', 'purple', 'animated'],
    html: `<div class="field">
  <input id="email" type="email" placeholder=" " autocomplete="email" />
  <label for="email">Email address</label>
</div>`,
    css: `.field { position: relative; width: 280px; font-family: system-ui, sans-serif; }
.field input { width: 100%; padding: 18px 14px 8px; border: 2px solid #cbd5e1; border-radius: 10px; font-size: 16px; outline: none; transition: border-color .2s; }
.field input:focus { border-color: oklch(62.7% 0.265 303.9); }
.field label { position: absolute; left: 14px; top: 14px; color: #64748b; pointer-events: none; transition: all .15s ease; }
.field input:focus + label, .field input:not(:placeholder-shown) + label { top: 5px; font-size: 12px; color: oklch(50% 0.2 303.9); }`,
  },
  {
    title: 'Segmented tabs',
    description: 'A pill-shaped segmented control for switching between views.',
    category: 'navigation',
    tags: ['tabs', 'segmented', 'rounded'],
    html: `<nav class="tabs" aria-label="View">
  <a href="#" aria-current="page">Overview</a>
  <a href="#">Activity</a>
  <a href="#">Settings</a>
</nav>`,
    css: `.tabs { display: inline-flex; padding: 4px; gap: 4px; border-radius: 999px; background: #f1f5f9; font-family: system-ui, sans-serif; }
.tabs a { padding: 8px 16px; border-radius: 999px; color: #475569; text-decoration: none; font-size: 14px; font-weight: 500; }
.tabs a[aria-current="page"] { background: #fff; color: #0f172a; box-shadow: 0 1px 3px rgb(15 23 42 / .15); }
.tabs a:focus-visible { outline: 2px solid #4f46e5; outline-offset: 2px; }`,
  },
  {
    title: 'Spinner loader',
    description: 'A lightweight CSS-only spinner, from the InterfaceLab loader example, with a reduced-motion fallback.',
    category: 'feedback',
    tags: ['loader', 'spinner', 'purple', 'animated'],
    html: '<div class="loader" role="status" aria-label="Loading"></div>',
    css: `.loader { width: 32px; height: 32px; border: 4px solid oklch(62.7% 0.265 303.9); border-top-color: transparent;
  border-radius: 50%; animation: spin 1s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
@media (prefers-reduced-motion: reduce) { .loader { animation-duration: 3s; } }`,
  },
  {
    title: 'Success alert',
    description: 'An inline success message with an icon, title and supporting text.',
    category: 'feedback',
    tags: ['alert', 'green', 'status'],
    html: `<div class="alert" role="status">
  <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M20 6 9 17l-5-5"/></svg>
  <div><strong>Saved</strong><p>Your changes are live for everyone.</p></div>
</div>`,
    css: `.alert { display: flex; gap: 12px; align-items: flex-start; max-width: 340px; padding: 14px 16px; border-radius: 12px;
  background: #ecfdf5; color: #065f46; border: 1px solid #a7f3d0; font-family: system-ui, sans-serif; }
.alert strong { display: block; font-size: 15px; }
.alert p { margin: 2px 0 0; font-size: 14px; color: #047857; }`,
  },
  {
    title: 'Dot grid hero',
    description: 'A hero section on a subtle dot-grid background, adapted from the InterfaceLab background example.',
    category: 'layout',
    tags: ['hero', 'background', 'grid', 'section'],
    html: `<section class="hero">
  <h1>Build interfaces faster</h1>
  <p>Copy, adapt and share accessible UI components.</p>
</section>`,
    css: `.hero { width: min(560px, 90vw); padding: 56px 24px; text-align: center; border-radius: 20px; font-family: system-ui, sans-serif;
  background-color: #fff; background-image: radial-gradient(#cbd5e1 1px, transparent 1px); background-size: 16px 16px;
  border: 1px solid #e2e8f0; }
.hero h1 { margin: 0; font-size: 32px; color: #0f172a; }
.hero p { margin: 10px 0 0; color: #475569; }`,
  },
]

export const seedSamples: ActionHandler<Env> = (ctx) =>
  guard('seedSamples', async () => {
    const { userId, tools, env } = ctx
    if (!isSignedIn(userId)) return fail('unauthenticated', 'Sign in first.')
    if (userId !== env.OWNER_USER_ID) return fail('forbidden', 'Only the app owner can load the sample library.')

    const owned = must(
      await tools.query<ComponentData & Record<string, unknown>>('components', { where: { ownerId: userId }, limit: 200 }),
      'read samples',
    )
    const existingTitles = new Set(owned.records.filter((r) => Boolean(r.data.isSample)).map((r) => r.data.title))
    let created = 0
    const now = Date.now()
    for (const [index, sample] of SAMPLES.entries()) {
      if (existingTitles.has(sample.title)) continue
      must(
        await tools.create('components', {
          ...sample,
          status: 'published',
          ownerId: userId,
          authorName: SAMPLE_AUTHOR,
          isSample: true,
          feedbackCount: 0,
          publishedAt: now - index * 60_000,
        }),
        'create sample',
      )
      created += 1
    }
    return { success: true, data: { created, total: SAMPLES.length } }
  })
