import { loadEnvConfig } from "@next/env";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { project, comment } from "../app/lib/db/schema";
import { seedProjects, seedComments } from "../app/lib/data";
import { databaseConfig } from "../app/lib/db/config";
loadEnvConfig(process.cwd());
const { url, authToken } = databaseConfig();
// Illustrative content is for development and tests only.
if (!url.startsWith("file:")) {
  console.error("Refusing to seed a hosted database.");
  process.exit(1);
}
const client = createClient({ url, authToken, timeout: 5000, concurrency: 1 });
const db = drizzle(client);
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
console.log("Illustrative projects and comments seeded.");
