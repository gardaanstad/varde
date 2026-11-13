<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Testing

The Playwright suite (`bun run test`) runs against a production build. Before committing, run `bun run lint`, `bun run typecheck`, and the specs that cover what you changed — not the whole suite. Run one spec file, or narrow it with `-g`: `bun run test tests/explorer.spec.ts -g "<test name>"`. To find the tests that cover a change, grep `tests/` for the visible text, role names or `data-*` attributes it touches. The spec files cover:

- `explorer.spec.ts`: the list, map, filters, search, sort, place, and the desktop sidebar and mobile drawer layout
- `panels.spec.ts`: project panels and their headers and actions, the login prompt, and flows that stay in place (account panel, Forslag)
- `accounts.spec.ts`: sign-in, onboarding, usernames, profiles, account settings, and server-side authorization
- `discussion.spec.ts`: comments, replies, votes, sorting, and project updates
- `following.spec.ts`: following, unread counts, and the Følger list
- `suggestions.spec.ts`: suggestions and the moderation queue
- `uploads.spec.ts`: photo uploads
- `diff.spec.ts`: the suggestion diff (pure functions, no browser)

Run the full suite only when a change reaches across areas, or when asked; CI runs it on every push to `main` and on pull requests either way. That covers the shell shared by every page (`explorer.tsx`, panels and drawers, `app/layout.tsx`, global CSS), auth, the database schema or migrations, the seed data in `app/lib/data.ts`, and the test setup (`playwright.config.ts`, `tests/support.ts`, `scripts/test-db.ts`). Run it in the background. If a spec you didn't touch fails, rerun it alone. If it passes alone, it's flaky: name it in your report, and don't fix it inside an unrelated change.

Each worktree gets its own test port, database, and build directory, so runs in different worktrees don't block each other.

Specs run with reduced motion, so they don't wait out animations; a spec about motion itself starts with `await page.emulateMedia({ reducedMotion: "no-preference" })`. No traces are recorded: rerun a failing spec with `--trace on` to get one. Set `TEST_SCREENSHOTS=<dir>` to save the review screenshots specs take with `shot()`.

Pages are server-rendered, so a test can click before the page is interactive. Don't paper over that with retries or timeouts. Make sure listeners that a click depends on exist by the time the page hydrates (register them in a layout effect, not a passive effect), or wait for a visible sign that the page is ready. To check a fix for a flaky test, run it under load: `--repeat-each 60 --workers 12`.
