import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { getDb } from "../db/client";
import {
  bookmark,
  comment,
  project,
  rateLimit,
  suggestion,
  user,
  vote,
} from "../db/schema";
import { getProjectUpdates, type Comment, type Project } from "../data";
import { HttpError } from "./http";

/**
 * Everything the explorer shows. `suggestions` counts pending suggestions:
 * the whole queue for moderators, the viewer's own for everyone else.
 */
export async function readCommunity(userId?: string, moderator = false) {
  const db = getDb();
  const [projects, rows, saved, votes, [pending]] = await Promise.all([
    db.select().from(project),
    db
      .select({
        id: comment.id,
        projectId: comment.projectId,
        updateId: comment.updateId,
        parentId: comment.parentId,
        author: sql<string>`coalesce(${user.username}, ${comment.seedAuthor}, 'slettet_bruker')`,
        text: comment.text,
        date: comment.date,
        votes: sql<number>`${comment.seedVotes} + coalesce(sum(${vote.value}), 0)`,
      })
      .from(comment)
      .leftJoin(user, eq(comment.userId, user.id))
      .leftJoin(vote, eq(vote.commentId, comment.id))
      .groupBy(comment.id)
      .orderBy(comment.date, comment.id),
    userId ? db.select().from(bookmark).where(eq(bookmark.userId, userId)) : [],
    userId ? db.select().from(vote).where(eq(vote.userId, userId)) : [],
    userId
      ? db
          .select({ count: sql<number>`count(*)` })
          .from(suggestion)
          .where(
            and(
              eq(suggestion.status, "pending"),
              moderator ? undefined : eq(suggestion.userId, userId),
            ),
          )
      : [{ count: 0 }],
  ]);
  const ids = new Set(rows.map((row) => row.id));
  const updateIds = new Map(
    projects.map(({ data }) => [
      data.id,
      new Set(getProjectUpdates(data).map((update) => update.id)),
    ]),
  );
  const comments: Comment[] = rows.map((row) => ({
    ...row,
    updateId: updateIds.get(row.projectId)?.has(row.updateId)
      ? row.updateId
      : undefined,
    parentId: row.parentId && ids.has(row.parentId) ? row.parentId : undefined,
  }));
  return {
    projects: projects.map((row) => row.data),
    comments,
    saved: saved.map((row) => row.projectId),
    votes: Object.fromEntries(votes.map((row) => [row.commentId, row.value])),
    suggestions: pending?.count ?? 0,
  };
}

/**
 * Atomic per-key throttling that works across server instances: at most
 * `limit` requests per `window` milliseconds.
 */
export async function throttle(
  userId: string,
  {
    key = `community:${userId}`,
    limit = 40,
    window = 60_000,
    message = "Litt mange endringer på kort tid. Vent et minutt og prøv igjen.",
  } = {},
) {
  const now = Date.now();
  const expired = sql`${rateLimit.lastRequest} < ${now - window}`;
  const [row] = await getDb()
    .insert(rateLimit)
    .values({ id: key, key, count: 1, lastRequest: now })
    .onConflictDoUpdate({
      target: rateLimit.key,
      set: {
        count: sql`case when ${expired} then 1 else ${rateLimit.count} + 1 end`,
        lastRequest: sql`case when ${expired} then ${now} else ${rateLimit.lastRequest} end`,
      },
    })
    .returning();
  if (row.count > limit) throw new HttpError(429, message);
}

export async function findProject(id: string) {
  const [row] = await getDb()
    .select({ data: project.data })
    .from(project)
    .where(eq(project.id, id));
  if (!row) throw new HttpError(404, "Prosjektet finnes ikke.");
  return row.data;
}

/** Edit and creation times always come from the server. */
export async function saveProject(data: Project, create: boolean) {
  const db = getDb();
  const now = new Date().toISOString();
  if (create) {
    const [inserted] = await db
      .insert(project)
      .values({ id: data.id, data: { ...data, updated: now, created: now } })
      .onConflictDoNothing()
      .returning();
    if (!inserted) throw new HttpError(409, "Prosjektet finnes allerede.");
    return;
  }
  const existing = await findProject(data.id);
  const [updated] = await db
    .update(project)
    .set({ data: { ...data, updated: now, created: existing.created } })
    .where(eq(project.id, data.id))
    .returning({ id: project.id });
  if (!updated) throw new HttpError(404, "Prosjektet finnes ikke.");
}

export async function castVote(
  userId: string,
  commentId: string,
  value: -1 | 0 | 1,
) {
  const db = getDb();
  const [target] = await db
    .select({ id: comment.id })
    .from(comment)
    .where(eq(comment.id, commentId));
  if (!target) throw new HttpError(404, "Kommentaren finnes ikke.");
  if (value === 0)
    await db
      .delete(vote)
      .where(and(eq(vote.userId, userId), eq(vote.commentId, commentId)));
  else
    await db
      .insert(vote)
      .values({ userId, commentId, value })
      .onConflictDoUpdate({
        target: [vote.userId, vote.commentId],
        set: { value },
      });
}

export async function setBookmark(
  userId: string,
  projectId: string,
  saved: boolean,
) {
  await findProject(projectId);
  const db = getDb();
  if (saved)
    await db
      .insert(bookmark)
      .values({ userId, projectId })
      .onConflictDoNothing();
  else
    await db
      .delete(bookmark)
      .where(
        and(eq(bookmark.userId, userId), eq(bookmark.projectId, projectId)),
      );
}

export async function addComment(
  userId: string,
  input: {
    projectId: string;
    updateId?: string;
    parentId?: string;
    text: string;
  },
) {
  const target = await findProject(input.projectId);
  if (
    input.updateId &&
    !getProjectUpdates(target).some((update) => update.id === input.updateId)
  )
    throw new HttpError(400, "Oppdateringen finnes ikke.");
  const db = getDb();
  if (input.parentId) {
    const [parent] = await db
      .select({ projectId: comment.projectId })
      .from(comment)
      .where(eq(comment.id, input.parentId));
    if (!parent || parent.projectId !== input.projectId)
      throw new HttpError(400, "Svaret må tilhøre den samme samtalen.");
  }
  // Identity and timestamps always come from the verified session and server.
  await db.insert(comment).values({
    id: crypto.randomUUID(),
    projectId: input.projectId,
    updateId: input.updateId || "",
    parentId: input.parentId,
    text: input.text,
    date: new Date().toISOString(),
    userId,
  });
}
