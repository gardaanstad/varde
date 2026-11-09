import "server-only";
import { and, asc, eq, isNotNull, sql } from "drizzle-orm";
import { getDb } from "../db/client";
import { suggestion, user } from "../db/schema";
import type { Project } from "../data";

/**
 * Usernames of members whose approved suggestions shaped each project, and
 * of those whose tips became updates. Deleted or renamed accounts follow.
 */
export async function readCredits() {
  const rows = await getDb()
    .select({
      kind: suggestion.kind,
      projectId: suggestion.projectId,
      updateId: sql<string | null>`json_extract(${suggestion.data}, '$.updateId')`,
      username: user.username,
    })
    .from(suggestion)
    .innerJoin(user, eq(user.id, suggestion.userId))
    .where(
      and(
        eq(suggestion.status, "approved"),
        isNotNull(suggestion.projectId),
        isNotNull(user.username),
      ),
    )
    .orderBy(asc(suggestion.reviewedAt));
  const projects = new Map<string, string[]>();
  const updates = new Map<string, string>();
  for (const { kind, projectId, updateId, username } of rows) {
    if (!projectId || !username) continue;
    if (kind === "update") {
      if (updateId) updates.set(updateId, username);
      continue;
    }
    const names = projects.get(projectId) ?? [];
    if (!names.includes(username)) projects.set(projectId, [...names, username]);
  }
  return { projects, updates };
}

/** Lays credits over projects as they are read; never stored with them. */
export function credit(
  data: Project,
  credits: Awaited<ReturnType<typeof readCredits>>,
): Project {
  const contributors = credits.projects.get(data.id);
  const tipped = data.updates.some((update) => credits.updates.has(update.id));
  if (!contributors && !tipped) return data;
  return {
    ...data,
    contributors,
    updates: tipped
      ? data.updates.map((update) => {
          const via = credits.updates.get(update.id);
          return via ? { ...update, via } : update;
        })
      : data.updates,
  };
}
