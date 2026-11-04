import "server-only";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import * as schema from "./schema";

function connect() {
  const url =
    process.env.DATABASE_URL ||
    (process.env.NODE_ENV !== "production" ? "file:./local.db" : "");
  if (!url) throw new Error("DATABASE_URL must be configured in production.");
  return drizzle(
    createClient({
      url,
      authToken: process.env.DATABASE_AUTH_TOKEN,
      timeout: 5000,
      concurrency: url.startsWith("file:") ? 1 : 20,
    }),
    { schema },
  );
}
// Reuse the local connection through Next.js development reloads.
const shared = globalThis as typeof globalThis & {
  vardeDatabase?: ReturnType<typeof connect>;
};
export function getDb() {
  return (shared.vardeDatabase ??= connect());
}
