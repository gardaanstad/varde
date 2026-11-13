import "server-only";
import { and, eq, gte, inArray, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/sqlite-core";
import { getDb } from "../db/client";
import { comment, project, projectView } from "../db/schema";
import { getProjectUpdates, type Project } from "../data";
import type { ProjectNews, Unread } from "../unread";
import { HttpError } from "./http";
import { serverNow } from "./clock";

/** One unread item on a project the user has opened. */
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

// Async, so the query runs once however many callers await it.
async function readProjects(ids: string[]) {
  return getDb()
    .select({ data: project.data })
    .from(project)
    .where(inArray(project.id, ids));
}

async function viewedProjects(userId: string) {
  return getDb()
    .select({ projectId: projectView.projectId, seenAt: projectView.seenAt })
    .from(projectView)
    .where(eq(projectView.userId, userId));
}

/**
 * Everything on the projects the user has opened since each was last seen:
 * new updates, and comments by others (replies to the user's own comments
 * marked as such). Oldest first. A notification digest can reuse this.
 */
export async function unreadActivity(
  userId: string,
  views?: { projectId: string; seenAt: Date }[],
  /** The viewed projects' data, when the caller has read it already. */
  projectData?: Promise<{ data: Project }[]>,
) {
  views ??= await viewedProjects(userId);
  if (views.length === 0) return [];
  const db = getDb();
  const seen = new Map(
    views.map((row) => [row.projectId, row.seenAt.getTime()]),
  );
  const ids = [...seen.keys()];
  const earliest = Math.min(...seen.values()) - slack;
  const parent = alias(comment, "parent");
  const [projects, comments] = await Promise.all([
    projectData ?? readProjects(ids),
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

/** Each opened project with its unread counts and latest activity. */
export async function readUnread(userId: string): Promise<Unread> {
  const readAt = serverNow().toISOString();
  const views = await viewedProjects(userId);
  if (views.length === 0) return { projects: [], readAt };
  const ids = views.map((row) => row.projectId);
  const db = getDb();
  const projectData = readProjects(ids);
  const [unread, latestComments, projects] = await Promise.all([
    unreadActivity(userId, views, projectData),
    db
      .select({
        projectId: comment.projectId,
        latest: sql<string>`max(${comment.date})`,
      })
      .from(comment)
      .where(inArray(comment.projectId, ids))
      .groupBy(comment.projectId),
    projectData,
  ]);
  const summaries = new Map<string, ProjectNews>(
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
 * Marks a project opened and read up to a given read. Never moves back, and
 * never past the server's clock, so later activity stays unread. The first
 * time, this starts keeping the project's read state.
 */
export async function markProjectSeen(
  userId: string,
  projectId: string,
  readAt: string,
) {
  const until = Math.min(Date.parse(readAt), serverNow().getTime());
  if (!Number.isFinite(until)) throw new HttpError(400, "Ugyldig tidspunkt.");
  const [exists] = await getDb()
    .select({ id: project.id })
    .from(project)
    .where(eq(project.id, projectId));
  if (!exists) throw new HttpError(404, "Prosjektet finnes ikke.");
  const at = new Date(until);
  await getDb()
    .insert(projectView)
    .values({ userId, projectId, saved: false, createdAt: at, seenAt: at })
    .onConflictDoUpdate({
      target: [projectView.userId, projectView.projectId],
      set: { seenAt: sql`max(${projectView.seenAt}, ${until})` },
    });
}
