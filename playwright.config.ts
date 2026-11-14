import { createHash } from "node:crypto";
import { defineConfig } from "@playwright/test";
// One port per checkout so test runs in separate worktrees never collide.
// Set on process.env so test workers (and tests/support.ts) see the same value.
process.env.TEST_PORT ||= String(
  3100 + (createHash("sha1").update(__dirname).digest().readUInt16BE(0) % 900),
);
const origin = `http://127.0.0.1:${process.env.TEST_PORT}`;
export default defineConfig({
  testDir: "./tests",
  fullyParallel: true,
  workers: 4,
  timeout: 45_000,
  // On GitHub Actions, failures also show as annotations on the run.
  reporter: process.env.GITHUB_ACTIONS ? [["github"], ["list"]] : "list",
  use: {
    baseURL: origin,
    browserName: "chromium",
    // Recording traces roughly doubles test time; rerun a failure with
    // `--trace on` to get one.
    trace: "off",
    screenshot: "only-on-failure",
    // The app skips its animations under reduced motion, so specs needn't wait
    // them out. Specs about motion opt back in with "no-preference".
    contextOptions: { reducedMotion: "reduce" },
  },
  webServer: {
    command:
      // A production build: pages respond in milliseconds instead of compiling
      // on first request, and Turbopack's build cache keeps rebuilds short.
      `bun scripts/test-db.ts && next build && next start --hostname 127.0.0.1 --port ${process.env.TEST_PORT}`,
    url: `${origin}/api/auth/get-session`,
    reuseExistingServer: false,
    timeout: 180_000,
    env: {
      DATABASE_URL: "file:./test-auth.db",
      DATABASE_AUTH_TOKEN: "",
      BETTER_AUTH_SECRET: "test-only-secret-never-use-in-production-72f9d1",
      BETTER_AUTH_URL: origin,
      GOOGLE_CLIENT_ID: "test-client.apps.googleusercontent.com",
      GOOGLE_CLIENT_SECRET: "test-google-secret",
      NEXT_TEST_DIST_DIR: ".next-test",
      // Vector tiles with software WebGL make specs slow; see basemapEnabled.
      NEXT_PUBLIC_BASEMAP: "off",
      // All test pages share one IP; see auth-config.ts.
      AUTH_SESSION_RATE_LIMIT: "off",
      MODERATOR_EMAILS:
        [
          "moderator@example.test",
          "discussion-moderator@example.test",
          "upload-moderator@example.test",
          "upload-api-moderator@example.test",
          "upload-edit-moderator@example.test",
          "suggestion-photo-moderator@example.test",
          "suggestion-api-moderator@example.test",
          "suggestion-moderator@example.test",
          "suggestion-project-moderator@example.test",
          "panel-moderator@example.test",
          "menu-moderator@example.test",
          "header-moderator@example.test",
          "osm-api-moderator@example.test",
          "osm-create-moderator@example.test",
          "osm-filter-moderator@example.test",
          "osm-hide-moderator@example.test",
        ].join(","),
    },
  },
});
