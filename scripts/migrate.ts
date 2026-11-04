import { loadEnvConfig } from "@next/env";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import { project, comment } from "../app/lib/db/schema";
import { seedProjects, seedComments } from "../app/lib/data";
loadEnvConfig(process.cwd());
const url = process.env.DATABASE_URL || "file:./local.db";
const client = createClient({
  url,
  authToken: process.env.DATABASE_AUTH_TOKEN,
  timeout: 5000,
  concurrency: 1,
});
if (url.startsWith("file:")) await client.execute("PRAGMA journal_mode = WAL");
const db = drizzle(client);
await migrate(db, { migrationsFolder: "./drizzle" });
// Seeds never replace existing rows, so edits and real discussion survive.
await db
  .insert(project)
  .values(seedProjects.map((item) => ({ id: item.id, data: item })))
  .onConflictDoNothing();
await db
  .insert(comment)
  .values(
    seedComments.map((item) => ({
      id: item.id,
      projectId: item.projectId,
      updateId: item.updateId || "",
      seedAuthor: item.author,
      parentId: item.parentId,
      text: item.text,
      date: item.date,
      seedVotes: item.votes,
    })),
  )
  .onConflictDoNothing();
client.close();
console.log("Database migrated; illustrative projects and comments seeded.");
