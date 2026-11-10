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
  use: {
    baseURL: origin,
    browserName: "chromium",
    trace: "retain-on-failure",
  },
  webServer: {
    command:
      `bun scripts/test-db.ts && bun run dev --hostname 127.0.0.1 --port ${process.env.TEST_PORT}`,
    url: `${origin}/api/auth/get-session`,
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      DATABASE_URL: "file:./test-auth.db",
      DATABASE_AUTH_TOKEN: "",
      BETTER_AUTH_SECRET: "test-only-secret-never-use-in-production-72f9d1",
      BETTER_AUTH_URL: origin,
      GOOGLE_CLIENT_ID: "test-client.apps.googleusercontent.com",
      GOOGLE_CLIENT_SECRET: "test-google-secret",
      NEXT_TEST_DIST_DIR: ".next-test",
      MODERATOR_EMAILS:
        [
          "moderator@example.test",
          "discussion-moderator@example.test",
          "upload-moderator@example.test",
          "upload-api-moderator@example.test",
          "suggestion-api-moderator@example.test",
          "suggestion-moderator@example.test",
          "suggestion-project-moderator@example.test",
          "panel-moderator@example.test",
        ].join(","),
    },
  },
});
