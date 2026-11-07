import "server-only";
import { and, eq, gte, inArray, isNull, ne, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/sqlite-core";
import { getDb } from "../db/client";
import { comment, follow, project, user } from "../db/schema";
import { getProjectUpdates } from "../data";
import type { Feed, FeedItem } from "../feed";
import { HttpError } from "./http";

/** How far back the feed reaches, and how many items it returns. */
const feedWindow = 60 * 24 * 60 * 60 * 1000;
const feedLimit = 80;
const excerpt = 280;

export type Activity = Omit<FeedItem, "unread"> & {
  /** When the project was followed; replies are relevant regardless. */
  followedAt?: number;
};

function shorten(text: string) {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > excerpt ? `${flat.slice(0, excerpt - 1)}…` : flat;
}

/**
 * Everything new for one user since `since`, newest first, without read
 * state: updates and comments on followed projects (from the time each was
 * followed) and replies to the user's comments on any project. The user's own
 * comments never count. Kept separate from read state so a notification
 * digest can call it with the time it last sent.
 */
export async function collectActivity(
  userId: string,
  since: Date,
): Promise<Activity[]> {
  const db = getDb();
  const sinceDate = since.toISOString();
  const parent = alias(comment, "parent");
  const othersOnly = or(isNull(comment.userId), ne(comment.userId, userId));
  const author = sql<string>`coalesce(${user.username}, ${comment.seedAuthor}, 'slettet_bruker')`;
  const [follows, replies] = await Promise.all([
    db
      .select({ projectId: follow.projectId, createdAt: follow.createdAt })
      .from(follow)
      .where(eq(follow.userId, userId)),
    db
      .select({
        id: comment.id,
        projectId: comment.projectId,
        text: comment.text,
        date: comment.date,
        author,
      })
      .from(comment)
      .innerJoin(parent, eq(comment.parentId, parent.id))
      .leftJoin(user, eq(comment.userId, user.id))
      .where(
        and(
          eq(parent.userId, userId),
          othersOnly,
          gte(comment.date, sinceDate),
        ),
      ),
  ]);
  const followedAt = new Map(
    follows.map((row) => [row.projectId, row.createdAt.getTime()]),
  );
  const ids = [...followedAt.keys()];
  const [projects, comments] = ids.length
    ? await Promise.all([
        db
          .select({ data: project.data })
          .from(project)
          .where(inArray(project.id, ids)),
        db
          .select({
            id: comment.id,
            projectId: comment.projectId,
            text: comment.text,
            date: comment.date,
            author,
          })
          .from(comment)
          .leftJoin(user, eq(comment.userId, user.id))
          .where(
            and(
              inArray(comment.projectId, ids),
              othersOnly,
              gte(comment.date, sinceDate),
            ),
          ),
      ])
    : [[], []];

  const items: Activity[] = [];
  const replyIds = new Set(replies.map((row) => row.id));
  for (const row of replies)
    items.push({
      key: `comment:${row.id}`,
      kind: "reply",
      projectId: row.projectId,
      date: row.date,
      text: shorten(row.text),
      commentId: row.id,
      author: row.author,
    });
  for (const row of comments)
    if (!replyIds.has(row.id))
      items.push({
        key: `comment:${row.id}`,
        kind: "comment",
        projectId: row.projectId,
        date: row.date,
        text: shorten(row.text),
        commentId: row.id,
        author: row.author,
        followedAt: followedAt.get(row.projectId),
      });
  for (const { data } of projects)
    for (const update of getProjectUpdates(data))
      if (update.date >= sinceDate)
        items.push({
          key: `update:${update.id}`,
          kind: "update",
          projectId: data.id,
          date: update.date,
          text: update.title,
          updateId: update.id,
          followedAt: followedAt.get(data.id),
        });
  return items.sort((a, b) => Date.parse(b.date) - Date.parse(a.date));
}

async function seenTime(userId: string) {
  const [row] = await getDb()
    .select({ feedSeenAt: user.feedSeenAt, createdAt: user.createdAt })
    .from(user)
    .where(eq(user.id, userId));
  if (!row) throw new HttpError(401, "Logg inn for å fortsette.");
  return (row.feedSeenAt ?? row.createdAt).getTime();
}

export async function readFeed(userId: string): Promise<Feed> {
  const now = Date.now();
  const [seenAt, activity] = await Promise.all([
    seenTime(userId),
    collectActivity(userId, new Date(now - feedWindow)),
  ]);
  // Activity from before a project was followed is context, never news.
  const items = activity.map(({ followedAt = 0, ...item }) => ({
    ...item,
    unread: Date.parse(item.date) > Math.max(seenAt, followedAt),
  }));
  return {
    items: items.slice(0, feedLimit),
    unread: items.filter((item) => item.unread).length,
    readAt: new Date(now).toISOString(),
  };
}

/**
 * Marks everything up to a feed read as seen. Never moves back, and never
 * past the server's clock, so activity after that read stays unread.
 */
export async function markFeedSeen(userId: string, readAt: string) {
  const until = Math.min(Date.parse(readAt), Date.now());
  if (!Number.isFinite(until)) throw new HttpError(400, "Ugyldig tidspunkt.");
  await getDb()
    .update(user)
    .set({
      feedSeenAt: sql`max(coalesce(${user.feedSeenAt}, 0), ${until})`,
    })
    .where(eq(user.id, userId));
}
