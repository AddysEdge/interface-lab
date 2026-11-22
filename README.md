<div id="top"></div>

<div align="center">

# InterfaceLab

[![CI](https://github.com/AddysEdge/interface-lab/actions/workflows/ci.yml/badge.svg)](https://github.com/AddysEdge/interface-lab/actions/workflows/ci.yml)

### Discover, build, review, and share reusable UI components.

A community platform for developers to explore UI patterns, create HTML/CSS components,
preview them safely, copy source code, and improve designs through feedback.

</div>

## What you can do

- **Discover components:** browse a library with category filters, multiword search, sorting,
  and pagination. Included examples are marked **Sample**.
- **Create and preview:** write HTML, CSS and optional JavaScript with an isolated live preview.
- **Save private drafts:** return to work in progress, then publish when it is ready to share.
- **Share and reuse:** open a component's shareable page and copy its HTML or CSS.
- **Discuss improvements:** leave feedback and replies that update in real time.
- **Get creator assistance:** request suggested descriptions, tags, and accessibility improvements;
  choose which suggestions to apply and find supporting technical documentation.
- **Follow feedback:** opt into email notifications when someone comments on your components.

The core workflow is **browse -> create -> preview -> save -> publish -> discuss**.
Creators manage their own components, and feedback authors manage their own posts.

## Repository layout

InterfaceLab has evolved from its original Next.js implementation. Both implementations
remain in this repository, with separate dependencies and backend configuration.

| Location | Purpose |
|---|---|
| [`workshop/`](workshop/) | Current React/TypeScript application and worker backend |
| [`src/`](src/) | Earlier Next.js application using Clerk and Supabase |
| [`docs/VERIFICATION_CHECKLIST.md`](docs/VERIFICATION_CHECKLIST.md) | Manual release checks |
| [`docs/SETUP.md`](docs/SETUP.md) | Setup for the earlier Next.js implementation |

Use `workshop/` for the current application. Its [development guide](workshop/README.md)
contains backend setup, testing, and deployment instructions.

## Run locally

Use Node.js 24 and npm 11.6 or newer.

```bash
cd workshop
npm ci
npm run login
# The registered application ID is committed in workshop/wrangler.toml.
npm run dev
```

The backend needs an authenticated developer account and a registered application ID.
Authentication, persistence, and integrations use the configured platform services.

**Live app:** [interfacelab.app.space](https://interfacelab.app.space). Automated end-to-end,
health and isolation checks pass against the deployed backend; the manual
[release checklist](docs/VERIFICATION_CHECKLIST.md) is still to be completed.

## How it works

The frontend uses React, TypeScript, Vite, and Tailwind CSS. A Hono worker handles authenticated
server actions, input validation, integrations, and delivery of the application. Schema-backed
records provide persistent storage, ownership rules, and real-time subscriptions.

| Creator tool | Purpose |
|---|---|
| AI component review | Suggest descriptions, tags, and potential accessibility improvements for a creator to review |
| Documentation search | Find reference pages from MDN, W3C, web.dev, WebAIM, A11Y Project, and CSS-Tricks |
| Feedback notifications | Email an opted-in creator when another user leaves feedback |

Integration requests run on the server with usage limits. External service failures should
leave the editor and publishing workflow usable. AI accessibility feedback is guidance for
human review, not a compliance certification.

## Access and preview isolation

- Published components are public; drafts are private to their creator.
- Component and feedback writes go through validated server actions with ownership checks.
- Identity and privileged fields come from trusted server context.
- Preview frames are sandboxed with no same-origin access. Their content security policy
  blocks remote subresources and network APIs. Component JavaScript is off by default and runs
  only when explicitly enabled. It cannot access the host page, cookies, or storage, open popups
  or dialogs, or navigate the top window. A script can initiate navigation of its own frame;
  the load handler then resets the preview with scripts off. Library thumbnails never run scripts.
- Feedback follows its component's visibility. Unpublishing hides feedback before the component
  becomes private; if a step fails, the component stays published or its feedback stays hidden,
  never exposed, and retrying finishes the change. Feedback submitted during an unpublish is
  withdrawn.
- The app makes at most one email-send request per feedback item, including concurrent or
  retried posts. Failed or interrupted sends are not retried, so a notification can be missed.
  Provider acceptance and inbox delivery are separate; the app does not claim exactly-once delivery.
- Feedback can be removed by its author, by the creator of the component it is on, or by the app
  owner.
- Creators publish directly; the app owner can hide any component from the library (its creator
  keeps the draft but cannot republish it until it is restored) and remove any feedback from the
  **Moderation** page.

## Verification

Run checks from `workshop/`:

```bash
npm run lint
npm run type-check
npm run test:unit
npm run test:isolation
npm run test:workshop
npm run build
npm audit --omit=dev
```

Unit tests cover shared logic, permission rules, and server actions using a test record store
and mocked external integrations. Browser tests cover preview isolation. The two-user suite
requires a configured backend and test accounts; a skipped suite is not a verified product flow.
Unit tests and the production build currently require a registered application ID.

Before a release, complete the [manual checklist](docs/VERIFICATION_CHECKLIST.md), including
persistence, ownership restrictions, publishing, feedback, and real integration calls.

## Current boundaries

- The editor uses textareas with Tab-to-indent. The earlier Tailwind preview is available only
  in the original implementation.
- Search runs on the server over every published component and returns one page at a time.
  Responses are not cached so unpublished code disappears from subsequent requests, including
  requests using an old library version. A very large catalog would benefit from a dedicated
  search index.
- Moderation is performed by the app owner; there are no additional moderator roles.
- The original Supabase implementation still needs database migrations and access policies;
  see its [setup guide](docs/SETUP.md).

## License

Distributed under the **Apache License 2.0**. See [`LICENSE`](LICENSE).

<p align="right"><a href="#top">Back to top</a></p>
