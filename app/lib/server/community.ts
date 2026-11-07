import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { getDb } from "../db/client";
import { comment, follow, project, rateLimit, user, vote } from "../db/schema";
import { getProjectUpdates, type Comment, type Project } from "../data";
import { HttpError } from "./http";

export async function readCommunity(userId?: string) {
  const db = getDb();
  const [projects, rows, followed, votes] = await Promise.all([
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
          .where(eq(follow.userId, userId))
      : [],
    userId ? db.select().from(vote).where(eq(vote.userId, userId)) : [],
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
    following: followed.map((row) => row.projectId),
    votes: Object.fromEntries(votes.map((row) => [row.commentId, row.value])),
  };
}

const throttleWindow = 60_000;
const throttleLimit = 40;
/** Atomic per-account throttling that works across server instances. */
export async function throttle(userId: string) {
  const key = `community:${userId}`;
  const now = Date.now();
  const expired = sql`${rateLimit.lastRequest} < ${now - throttleWindow}`;
  const [limit] = await getDb()
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
  if (limit.count > throttleLimit)
    throw new HttpError(
      429,
      "Litt mange endringer på kort tid. Vent et minutt og prøv igjen.",
    );
}

async function findProject(id: string) {
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

export async function setFollow(
  userId: string,
  projectId: string,
  following: boolean,
) {
  await findProject(projectId);
  const db = getDb();
  if (following)
    await db.insert(follow).values({ userId, projectId }).onConflictDoNothing();
  else
    await db
      .delete(follow)
      .where(and(eq(follow.userId, userId), eq(follow.projectId, projectId)));
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
  // Taking part in a discussion follows the project, so replies and new
  // comments show up in the feed; following stays if it was already set.
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
      .values({ userId, projectId: input.projectId })
      .onConflictDoNothing(),
  ]);
}
