# InterfaceLab development guide

This directory contains the current InterfaceLab application. Product features and repository
layout are described in the [project README](../README.md). The earlier Next.js application
remains at the repository root.

## Stack

React, TypeScript, Vite, and Tailwind CSS provide the frontend. The worker uses Hono and the
DeepSpace SDK for authentication, persistent records, permissions, real-time updates, server
actions, and integration calls. The SDK is an implementation dependency; the product is
InterfaceLab.

## Setup

Use Node.js 24 and npm 11.6 or newer.

```bash
npm ci
npm run login
npx deepspace auth whoami --json
npm run dev
```

The application is registered: its server-issued `DEEPSPACE_APP_ID` is committed in
`wrangler.toml`. The ID is public configuration; authentication credentials and local session
files are not. Working against this app requires the owner's account or collaborator access;
to run a separate copy with its own data, register a new app with `npx deepspace app init --new-id`.
Never substitute a made-up ID for development or deployment.

See the [SDK documentation](https://docs.deep.space) for account setup and CLI details.

## Checks

```bash
npm run lint
npm run type-check
npm run test:unit
npm run test:isolation
npm run test:workshop
npm run build
npm audit --omit=dev
```

The regular unit-test configuration and production build require a registered app ID.
The two-user browser suite additionally needs a configured backend and at least two test
accounts. Use `npx deepspace test accounts create --help` for account provisioning; pass test
passwords through standard input rather than command-line arguments.

The isolation suite needs an installed browser. On Windows, if managed Chromium is unavailable:

```powershell
$env:DEEPSPACE_TEST_BROWSER_EXECUTABLE_PATH = 'C:\Program Files\Google\Chrome\Application\chrome.exe'
npm run test:isolation
```

Unit tests mock external integration calls. Run a minimal real check of each configured
integration before a release, within the account's authorized usage budget. Record skipped
or blocked checks explicitly.

## Deployment

```bash
npx deepspace auth whoami --json
npm run build
npm run deploy
```

The app is live at https://interfacelab.app.space. Its source authority is GitHub
(`AddysEdge/interface-lab`), bound permanently by the first release; a GitHub-backed deploy
ships the working tree, including uncommitted bytes, so deploy from a clean, pushed commit so
the release can be reproduced.

After each deployment, run `npm run test:deployed` (end-to-end and health specs against the live
app; override the target with `DEPLOYED_URL`), check `npx deepspace logs`, and follow the
[release checklist](../docs/VERIFICATION_CHECKLIST.md) with separate creator, second-user, and
signed-out sessions.

The app owner can load the marked sample library from `/home` after registration.

## Integration configuration

- `anthropic/chat-completion`: creator-requested component review.
- `exa/search`: documentation restricted to approved reference sites.
- `email/send`: opted-in feedback notifications.

Calls run through server actions and are billed to the configured app owner. Keep daily limits
and server-side authorization in place.

Notification guarantees (`src/server/notify.ts`, tested in `src/server/consistency.test.ts`):

- At most one email-send request per feedback item. Before sending, a request must claim the item's single
  ledger row (`uniqueOn [feedbackId, attempt]`, attempt 1). Exactly one concurrent submit or
  retry wins; the others return `already_handled` and neither send nor consume quota.
- No automatic re-send: failed or interrupted sends are not retried, including when a request
  crashes after provider acceptance. This prevents a duplicate application-side send request,
  at the cost of possibly missed notifications. Inbox delivery is controlled by the provider;
  the app does not claim exactly-once delivery.
- Limits: 20 emails per recipient and 200 per app per day. A failed email never fails the
  feedback post.

Moderation (`moderateComponent`, `listHiddenComponents`, `deleteFeedback`): only the app owner
(`OWNER_USER_ID`) can hide or restore components; hiding uses the same fail-closed sequence as
unpublishing and sets `moderation: 'hidden'`, which blocks republishing. Feedback can be removed
by its author, the component's creator, or the app owner.

Library search (`GET /api/library`, `src/server/library.ts`): public, server-side, one page per
request, published and unmoderated components only, scripts never included. Responses use
`Cache-Control: no-store` so an old version's URL cannot reveal unpublished code. Changes to
published content update `library_meta`; browsers subscribe to that record and refetch.

Component JavaScript (`src/shared/preview.ts`): scripts run only on explicit request with
`sandbox="allow-scripts"` (never `allow-same-origin`) and a CSP with `connect-src 'none'`.
The sandbox blocks parent-page access, forms, popups and top-level navigation; the CSP blocks
remote subresources and network APIs. A script can still start a navigation of its own frame
before the load handler detects it and resets the preview with scripts off. HTML/CSS previews
and library thumbnails keep scripts disabled.

Feedback visibility (`src/server/visibility.ts`): unpublish hides feedback before flipping the
component and converges again afterwards; publish flips first, then reveals. Failures are
fail-closed and reported as `visibility_incomplete`, and repeating the action repairs them.
`createFeedback` re-checks the component after writing and withdraws the post if the component
was unpublished in the meantime. Sync and the feedback counter page through every item (no cap).

Server actions are registered with `waitUntil` (`src/server/action-routes.ts`), so once an action
starts it runs to completion even if the client disconnects, for example by closing the tab right
after deleting feedback. Without this, the worker cancelled the follow-up counter refresh.

## Agent instructions

The scaffold's [AGENTS.md](AGENTS.md) documents the backend tooling. Keep product copy focused
on InterfaceLab and its users; name dependencies accurately in technical configuration.
