import "server-only";
import { and, eq, gte, inArray, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/sqlite-core";
import { getDb } from "../db/client";
import { comment, follow, project } from "../db/schema";
import { getProjectUpdates } from "../data";
import type { FollowedProject, Following } from "../following";
import { HttpError } from "./http";

/** One unread item on a followed project. */
export type UnreadItem = {
  projectId: string;
  kind: "update" | "comment" | "reply";
  date: string;
  updateId?: string;
  commentId?: string;
};

// Some stored dates have no time zone and are read as server-local time, so
// the database pre-filter reaches a day further back than needed.
const slack = 24 * 60 * 60 * 1000;
const time = (date: string) => Date.parse(date) || 0;

async function followedProjects(userId: string) {
  return getDb()
    .select({ projectId: follow.projectId, seenAt: follow.seenAt })
    .from(follow)
    .where(and(eq(follow.userId, userId), eq(follow.following, true)));
}

/**
 * Everything on the user's followed projects since each was last seen: new
 * updates, and comments by others (replies to the user's own comments marked
 * as such). Oldest first. A notification digest can reuse this as it is.
 */
export async function unreadActivity(
  userId: string,
  follows?: { projectId: string; seenAt: Date }[],
) {
  follows ??= await followedProjects(userId);
  if (follows.length === 0) return [];
  const db = getDb();
  const seen = new Map(
    follows.map((row) => [row.projectId, row.seenAt.getTime()]),
  );
  const ids = [...seen.keys()];
  const earliest = Math.min(...seen.values()) - slack;
  const parent = alias(comment, "parent");
  const [projects, comments] = await Promise.all([
    db
      .select({ data: project.data })
      .from(project)
      .where(inArray(project.id, ids)),
    db
      .select({
        id: comment.id,
        projectId: comment.projectId,
        date: comment.date,
        userId: comment.userId,
        parentUserId: parent.userId,
      })
      .from(comment)
      .leftJoin(parent, eq(comment.parentId, parent.id))
      .where(
        and(
          inArray(comment.projectId, ids),
          gte(
            comment.date,
            new Date(Math.max(earliest, 0)).toISOString().slice(0, 10),
          ),
        ),
      ),
  ]);
  const items: UnreadItem[] = [];
  const isNew = (projectId: string, date: string) =>
    time(date) > (seen.get(projectId) ?? Infinity);
  for (const row of comments)
    if (row.userId !== userId && isNew(row.projectId, row.date))
      items.push({
        projectId: row.projectId,
        kind: row.parentUserId === userId ? "reply" : "comment",
        date: row.date,
        commentId: row.id,
      });
  for (const { data } of projects)
    for (const update of getProjectUpdates(data))
      if (isNew(data.id, update.date))
        items.push({
          projectId: data.id,
          kind: "update",
          date: update.date,
          updateId: update.id,
        });
  return items.sort((a, b) => time(a.date) - time(b.date));
}

/** Each followed project with its unread counts and latest activity. */
export async function readFollowing(userId: string): Promise<Following> {
  const readAt = new Date().toISOString();
  const follows = await followedProjects(userId);
  if (follows.length === 0) return { projects: [], readAt };
  const ids = follows.map((row) => row.projectId);
  const db = getDb();
  const [unread, latestComments, projects] = await Promise.all([
    unreadActivity(userId, follows),
    db
      .select({
        projectId: comment.projectId,
        latest: sql<string>`max(${comment.date})`,
      })
      .from(comment)
      .where(inArray(comment.projectId, ids))
      .groupBy(comment.projectId),
    db
      .select({ data: project.data })
      .from(project)
      .where(inArray(project.id, ids)),
  ]);
  const summaries = new Map<string, FollowedProject>(
    projects.map(({ data }) => [
      data.id,
      {
        projectId: data.id,
        latest: getProjectUpdates(data)[0]?.date,
        comments: 0,
        replies: 0,
        updates: 0,
      },
    ]),
  );
  for (const row of latestComments) {
    const summary = summaries.get(row.projectId);
    if (summary && time(row.latest) > time(summary.latest ?? ""))
      summary.latest = row.latest;
  }
  for (const item of unread) {
    const summary = summaries.get(item.projectId);
    if (!summary) continue;
    if (item.kind === "update") summary.updates += 1;
    else if (item.kind === "reply") summary.replies += 1;
    else summary.comments += 1;
    summary.first ??= item.updateId
      ? { updateId: item.updateId }
      : { commentId: item.commentId };
  }
  return { projects: [...summaries.values()], readAt };
}

/**
 * Marks one followed project read up to a given read. Never moves back, and
 * never past the server's clock, so later activity stays unread.
 */
export async function markProjectSeen(
  userId: string,
  projectId: string,
  readAt: string,
) {
  const until = Math.min(Date.parse(readAt), Date.now());
  if (!Number.isFinite(until)) throw new HttpError(400, "Ugyldig tidspunkt.");
  await getDb()
    .update(follow)
    .set({ seenAt: sql`max(${follow.seenAt}, ${until})` })
    .where(
      and(
        eq(follow.userId, userId),
        eq(follow.projectId, projectId),
        eq(follow.following, true),
      ),
    );
}
