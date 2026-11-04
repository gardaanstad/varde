import "server-only";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { databaseConfig } from "./config";
import * as schema from "./schema";

function connect() {
  const { url, authToken } = databaseConfig();
  return drizzle(
    createClient({
      url,
      authToken,
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
