# InterfaceLab release verification checklist

Every box starts unchecked. Tick an item only after you have performed the check on the
deployed app (or locally, where noted). Use two different accounts (A and B) plus a private
or signed-out window.

## Setup
- [ ] `npx deepspace auth whoami` shows the account that should own the app
- [ ] `npx deepspace app init` ran and the new `DEEPSPACE_APP_ID` in `workshop/wrangler.toml` is committed
- [ ] `npm run test:unit`, `npm run test:isolation` and `npm run test:workshop` pass locally
- [ ] `npx deepspace deploy` reports `serving: confirmed`; the live URL loads

## Public browsing (signed out)
- [ ] `/` landing loads; "Browse components" opens the library
- [ ] Owner loaded the sample library; samples show a "Sample" badge
- [ ] Search "purple rounded" and "rounded purple" give the same results
- [ ] Category filter and sort change the results and the URL; page resets to 1
- [ ] Browser back/forward restores the previous filter and its results; refresh keeps them
- [ ] A component page shows the preview and Copy HTML / Copy CSS work
- [ ] Layout is usable on a phone-width screen

## Creator flow (account A)
- [ ] Sign in with GitHub or Google works
- [ ] Create a component, save a draft, reload: the draft and its code are still there
- [ ] The draft's `/c/<id>` URL shows "not found" to account B and to a signed-out window
- [ ] Publish: the component appears in the library for everyone
- [ ] Edit and save a published component; changes appear for others
- [ ] Unpublish hides it from others (and hides its feedback); republish restores both
- [ ] Delete removes the component and its feedback

## Second user (account B)
- [ ] B opens A's shared link, copies code, and posts feedback
- [ ] A sees B's feedback appear without reloading
- [ ] A replies; B sees the reply live
- [ ] B posts and immediately deletes a feedback item without reloading
- [ ] B sees no Edit/Publish/Delete controls on A's component and `/studio/<A's id>` says not found
- [ ] B cannot delete A's feedback (no control offered)

## Integrations (one real call each; watch credits with `npx deepspace app usage`)
- [ ] AI review returns suggestions; "Use these tags"/"Use this description" apply only after clicking, and need a save
- [ ] Docs search returns real MDN/W3C/web.dev links that open the right pages
- [ ] With A opted in (Settings), B's feedback sends A one email (check the inbox and spam)
- [ ] Feedback from A on A's own component sends no email
- [ ] Failure handling seen at least once (e.g. offline): an error with "Try again"; editing/saving still works

## Isolation spot check
- [ ] A component whose HTML contains `<script>alert(1)</script>` shows no alert and the page is unaffected

## Notes
Record anything that failed, with the time and the account used:

-
