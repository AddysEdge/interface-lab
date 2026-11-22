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

- Each send first claims an attempt row in the `notifications` ledger. `uniqueOn
  [feedbackId, attempt]` lets exactly one concurrent submit or retry claim attempt *N*; the
  others return `in_progress` and neither send nor consume quota.
- A delivered email is never re-sent. After a reported failure, a retry may claim the next
  attempt, up to 3 in total. Quota-skipped notifications are final.
- A pending attempt blocks retries for a 5-minute lease. If a request crashes after the
  provider accepted the email but before recording it, a retry after the lease can send a
  duplicate; `email/send` has no idempotency key.
- Limits: 20 emails per recipient and 200 per app per day. A failed email never fails the
  feedback post.

Feedback visibility (`src/server/visibility.ts`): unpublish hides feedback before flipping the
component and converges again afterwards; publish flips first, then reveals. Failures are
fail-closed and reported as `visibility_incomplete`, and repeating the action repairs them.
`createFeedback` re-checks the component after writing and withdraws the post if the component
was unpublished in the meantime. Sync and the feedback counter page through every item (no cap).

## Agent instructions

The scaffold's [AGENTS.md](AGENTS.md) documents the backend tooling. Keep product copy focused
on InterfaceLab and its users; name dependencies accurately in technical configuration.
