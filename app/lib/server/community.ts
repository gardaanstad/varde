import "server-only";
import { and, eq, isNotNull, isNull, sql } from "drizzle-orm";
import { getDb } from "../db/client";
import {
  comment,
  follow,
  project,
  rateLimit,
  suggestion,
  user,
  vote,
} from "../db/schema";
import { getProjectUpdates, type Comment, type Project } from "../data";
import { HttpError } from "./http";
import { credit, readCredits } from "./credits";

/**
 * Everything the explorer shows. `suggestions` counts pending suggestions:
 * the whole queue for moderators, the viewer's own for everyone else.
 * Approved suggestions credit their members on projects and updates.
 */
export async function readCommunity(userId?: string, moderator = false) {
  const db = getDb();
  const [projects, rows, followed, votes, [pending], [reviewed], credits] =
    await Promise.all([
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
    userId
      ? db
          .select({ projectId: follow.projectId })
          .from(follow)
          .where(and(eq(follow.userId, userId), eq(follow.following, true)))
      : [],
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
    userId && !moderator
      ? db
          .select({ count: sql<number>`count(*)` })
          .from(suggestion)
          .where(
            and(
              eq(suggestion.userId, userId),
              isNotNull(suggestion.reviewedAt),
              isNull(suggestion.seenAt),
            ),
          )
      : [{ count: 0 }],
    readCredits(),
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
    projects: projects.map((row) => credit(row.data, credits)),
    comments,
    following: followed.map((row) => row.projectId),
    votes: Object.fromEntries(votes.map((row) => [row.commentId, row.value])),
    suggestions: pending?.count ?? 0,
    /** The member's suggestions reviewed since they last looked. */
    reviewed: reviewed?.count ?? 0,
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

/** A follow that starts now, with nothing before it unread. */
function newFollow(userId: string, projectId: string, following = true) {
  const now = new Date();
  return { userId, projectId, following, createdAt: now, seenAt: now };
}

export async function setFollow(
  userId: string,
  projectId: string,
  following: boolean,
) {
  await findProject(projectId);
  const values = newFollow(userId, projectId, following);
  const now = values.createdAt.getTime();
  // Following again starts fresh; staying followed keeps the read state.
  await getDb()
    .insert(follow)
    .values(values)
    .onConflictDoUpdate({
      target: [follow.userId, follow.projectId],
      set: following
        ? {
            following: true,
            createdAt: sql`case when ${follow.following} then ${follow.createdAt} else ${now} end`,
            seenAt: sql`case when ${follow.following} then ${follow.seenAt} else ${now} end`,
          }
        : { following: false },
    });
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
  // Taking part in a discussion follows the project, unless the user has
  // unfollowed it before; an existing follow keeps its read state.
  await db.batch([
    db.insert(comment).values({
      id: crypto.randomUUID(),
      projectId: input.projectId,
      updateId: input.updateId || "",
      parentId: input.parentId,
      text: input.text,
      date: new Date().toISOString(),
      userId,
    }),
    db
      .insert(follow)
      .values(newFollow(userId, input.projectId))
      .onConflictDoNothing(),
  ]);
}
