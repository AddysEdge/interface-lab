# Local setup and verification

## Current scope

Interface Lab contains the Next.js UI, server actions, editor and preview rendering.
A working sign-in and publishing flow also requires your own Clerk and Supabase projects.

The repository does not yet include a database migration or Row Level Security (RLS)
policy set. A successful lint/build run does not verify the live database, authorization,
uploads, likes or comments. Treat the app as a development prototype until those are supplied
and tested with separate users.

## Environment

Use Node.js 24 (the CI version) and install the lockfile with `npm ci`.
Copy `.env.example` to `.env.local`, then supply your own values.

| Variable | Purpose |
|---|---|
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Browser-safe publishable key for your Clerk application |
| `CLERK_SECRET_KEY` | Server-only Clerk secret; never prefix it with NEXT_PUBLIC |
| `NEXT_PUBLIC_SUPABASE_URL` | Your Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_KEY` | Browser-safe publishable/anon key, protected by RLS; never a service-role key |
| `COMPONENT_IMAGE_HOST` | Optional HTTPS image hostname, without scheme or path |

The variable names match the current code; Supabase documentation may use a different name
for the publishable key. Keep actual values in the ignored local environment file.

## Authentication and database prerequisites

The server passes Clerk's session token to Supabase through `accessToken` in
`src/lib/client.js`. Configure the native integration using the
[Clerk guide](https://clerk.com/docs/guides/development/integrations/databases/supabase)
and [Supabase guide](https://supabase.com/docs/guides/auth/third-party/clerk).

The current server actions reference these tables:

- `elements`: component content, publishing state, creator identity and image URL.
- `elements_likes`: component/user likes.
- `comments`: component comments and replies.
- `comments_likes`: comment/user likes.

This list is an inventory of code dependencies, not an executable schema. Types,
constraints, relationship behavior and RLS still need a reviewed migration. Do not
disable RLS or use a privileged key as a shortcut. Clerk user IDs are strings;
design ownership policies for the token identity used by the integration.

## Run and check

```bash
npm ci
npm run dev
npm run lint
npm run build
```

Before exposing a configured deployment, verify at least:

- Anonymous browsing sees only published components.
- Sign-in and sign-out work.
- One user can publish, like and comment.
- A different user cannot edit or delete the first user's data.
- Unauthenticated writes are rejected.
- The preview remains isolated from the host app.

These live checks have not been established by CI. The workflow uses inert build-only
placeholders, so no production project or paid API is needed for linting and compilation.

## Build-only homepage preview

CI reads the generated server-rendered homepage and bundled assets from the production
build, serves them on a temporary loopback port, and captures them with Playwright.
It checks the accessible heading and category links with JavaScript disabled, blocks
off-origin requests, and saves a screenshot plus scope metadata as the `homepage-preview`
artifact. It does not test hydration, live middleware, authentication or the database.

To repeat after `npm run build`, install Chromium with `npx playwright install chromium`,
then run `npm run preview:check`. The command starts and closes its own static preview server.

The attempted live-runtime check with dummy Clerk configuration
([run 42759351466](https://github.com/AddysEdge/interface-lab/actions/runs/42759351466))
timed out before returning HTML. No authentication control was bypassed to make a
preview pass. A configured live-runtime check remains required before deployment.
