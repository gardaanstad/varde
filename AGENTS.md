<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Testing

The Playwright suite (`bun run test`) runs against a production build and takes under a minute. While iterating on UI, validate with `bun run lint` and `bun run typecheck`, and run only the spec covering the change, e.g. `bun run test tests/explorer.spec.ts -g "<test name>"`. Run the full suite only when asked or before committing, and run it in the background. Each worktree gets its own test port, database, and build directory, so runs in different worktrees don't block each other.

Specs run with reduced motion, so they don't wait out animations; a spec about motion itself starts with `await page.emulateMedia({ reducedMotion: "no-preference" })`. No traces are recorded: rerun a failing spec with `--trace on` to get one. Set `TEST_SCREENSHOTS=<dir>` to save the review screenshots specs take with `shot()`.
