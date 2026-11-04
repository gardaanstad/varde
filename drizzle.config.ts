import { loadEnvConfig } from "@next/env";
import { defineConfig } from "drizzle-kit";
import { databaseConfig } from "./app/lib/db/config";
loadEnvConfig(process.cwd());
export default defineConfig({
  schema: "./app/lib/db/schema.ts",
  out: "./drizzle",
  dialect: "turso",
  dbCredentials: databaseConfig(),
});
