import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { loadEnvConfig } from "@next/env";
import { createClient } from "@libsql/client";
import { and, like, notInArray, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/libsql";
import { comment, project } from "../app/lib/db/schema";
import { databaseConfig } from "../app/lib/db/config";
import { sampleComments, sampleProjects } from "./sample-data";

/**
 * Writes the sample projects to local SQLite databases. Samples are owned by
 * sample-data.ts: rerunning replaces them and drops ones no longer listed.
 * `--worktrees` writes to every git worktree's local.db, not just this one's.
 */
async function writeSamples(url: string) {
  if (!url.startsWith("file:")) throw new Error(`refusing hosted ${url}`);
  const client = createClient({ url, timeout: 5000, concurrency: 1 });
  const db = drizzle(client);
  try {
    const projectIds = sampleProjects.map((item) => item.id);
    const commentIds = sampleComments.map((item) => item.id);
    await db.transaction(async (tx) => {
      await tx
        .delete(project)
        .where(and(like(project.id, "sample-%"), notInArray(project.id, projectIds)));
      await tx
        .delete(comment)
        .where(and(like(comment.id, "sample-%"), notInArray(comment.id, commentIds)));
      await tx
        .insert(project)
        .values(sampleProjects.map((item) => ({ id: item.id, data: item })))
        .onConflictDoUpdate({
          target: project.id,
          set: { data: sql`excluded.data` },
        });
      await tx
        .insert(comment)
        .values(
          sampleComments.map((item) => ({
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
        .onConflictDoUpdate({
          target: comment.id,
          set: {
            projectId: sql`excluded.project_id`,
            updateId: sql`excluded.update_id`,
            seedAuthor: sql`excluded.seed_author`,
            parentId: sql`excluded.parent_id`,
            text: sql`excluded.text`,
            date: sql`excluded.date`,
            seedVotes: sql`excluded.seed_votes`,
          },
        });
    });
  } finally {
    client.close();
  }
}

function worktreeDatabases() {
  const list = execFileSync("git", ["worktree", "list", "--porcelain"], {
    encoding: "utf8",
  });
  return list
    .split("\n")
    .filter((line) => line.startsWith("worktree "))
    .map((line) => join(line.slice("worktree ".length), "local.db"));
}

loadEnvConfig(process.cwd());
const targets = process.argv.includes("--worktrees")
  ? worktreeDatabases()
      .filter((path) => existsSync(path))
      .map((path) => `file:${path}`)
  : [databaseConfig().url];
let failed = false;
for (const url of targets) {
  try {
    await writeSamples(url);
    console.log(`Sample projects written to ${url}`);
  } catch (error) {
    failed = true;
    console.error(`Skipped ${url}: ${(error as Error).message}`);
  }
}
if (failed) process.exitCode = 1;
