import "server-only";
import { cache } from "react";
import { headers } from "next/headers";
import { createAppAuth } from "./auth-config";
import { getDb } from "./db/client";

export function googleConfigured() {
  return Boolean(
    process.env.GOOGLE_CLIENT_ID &&
    process.env.GOOGLE_CLIENT_SECRET &&
    process.env.BETTER_AUTH_SECRET,
  );
}
/**
 * The public site origin. On Vercel it defaults to the production domain,
 * so preview deployments are browse-only; development falls back to localhost.
 */
export function siteURL() {
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  const url =
    process.env.BETTER_AUTH_URL ||
    (vercel ? `https://${vercel}` : "") ||
    (process.env.NODE_ENV !== "production" ? "http://localhost:3000" : "");
  if (!url) throw new Error("Set BETTER_AUTH_URL to the public site origin.");
  return url;
}
let instance: ReturnType<typeof createAppAuth> | undefined;
export function getAuth() {
  if (instance) return instance;
  const secret = process.env.BETTER_AUTH_SECRET;
  if (!secret || secret.length < 32)
    throw new Error(
      "Set BETTER_AUTH_SECRET to at least 32 random characters. Run bun run setup.",
    );
  instance = createAppAuth(getDb(), {
    secret,
    baseURL: siteURL(),
    googleClientId: process.env.GOOGLE_CLIENT_ID,
    googleClientSecret: process.env.GOOGLE_CLIENT_SECRET,
  });
  return instance;
}
/**
 * Reads the session without renewing it; renewal happens through
 * /api/auth/get-session, which can send cookies.
 */
export function readSession(requestHeaders: Headers) {
  return getAuth().api.getSession({
    headers: requestHeaders,
    query: { disableRefresh: true },
  });
}
/** The current page request's session, looked up once per render. */
export const getPageSession = cache(async () => readSession(await headers()));
