import "server-only";
import {
  aliasedTable,
  and,
  asc,
  desc,
  eq,
  isNotNull,
  isNull,
  ne,
  sql,
} from "drizzle-orm";
import type { z } from "zod";
import { getDb } from "../db/client";
import { project, suggestion, user } from "../db/schema";
import { projectSchema } from "../community-rules";
import type { Project } from "../data";
import {
  applyChanges,
  correctionKeys,
  type CorrectionChanges,
  type CorrectionKey,
  type Suggestion,
  type SuggestionLists,
  type submitSchema,
  tipTitle,
} from "../suggestions";
import { findProject, saveProject, throttle } from "./community";
import { HttpError } from "./http";
import { publishUploads, requireOwnImages } from "./uploads";
import { serverNow } from "./clock";

type Submission = z.output<typeof submitSchema>;
type Row = typeof suggestion.$inferSelect;

const maxPending = 20;

function projectImages(data: Project) {
  return [data.image, ...(data.images ?? []).map((photo) => photo.src)].filter(
    Boolean,
  );
}

function sameValue(a: unknown, b: unknown) {
  return JSON.stringify(a ?? "") === JSON.stringify(b ?? "");
}

export async function submitSuggestion(userId: string, input: Submission) {
  await throttle(userId, {
    key: `suggest:${userId}`,
    limit: 10,
    window: 3_600_000,
    message: "Du har sendt mange forslag. Prøv igjen om en time.",
  });
  const db = getDb();
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)` })
    .from(suggestion)
    .where(and(eq(suggestion.userId, userId), eq(suggestion.status, "pending")));
  if (count >= maxPending)
    throw new HttpError(
      429,
      "Du har mange forslag som venter. Vent til noen er behandlet.",
    );
  const base = {
    id: crypto.randomUUID(),
    userId,
    note: "note" in input ? input.note : "",
    createdAt: serverNow(),
  };
  switch (input.kind) {
    case "project": {
      // Identity, history and labels are the server's, never the member's.
      const now = serverNow().toISOString();
      const data: Project = {
        ...input.project,
        id: `prosjekt-${crypto.randomUUID().slice(0, 8)}`,
        updates: [],
        comments: 0,
        updated: now,
        created: undefined,
        example: undefined,
        imageCredit: undefined,
        imageSource: undefined,
      };
      await requireOwnImages(projectImages(data), userId);
      await db
        .insert(suggestion)
        .values({ ...base, kind: "project", data: { project: data } });
      return;
    }
    case "correction": {
      const current = await findProject(input.projectId);
      const proposed: CorrectionChanges = { ...input.changes };
      if ("image" in proposed || "images" in proposed) {
        // Credits and captions are the project's, never the member's.
        const next = applyChanges(current, proposed);
        proposed.image = next.image;
        // None left travels as an empty list, which storage keeps.
        if (next.images || current.images) proposed.images = next.images ?? [];
        else delete proposed.images;
        await requireOwnImages(projectImages(next), userId);
      }
      const changes: CorrectionChanges = {};
      for (const key of correctionKeys)
        if (key in proposed && !sameValue(proposed[key], current[key]))
          Object.assign(changes, { [key]: proposed[key] });
      // The centre follows the drawing and never changes on its own.
      delete changes.center;
      if (!Object.keys(changes).length)
        throw new HttpError(400, "Forslaget endrer ingenting.");
      projectSchema.parse(applyChanges(current, changes));
      const before = Object.fromEntries(
        Object.keys(changes).map((key) => [key, current[key as CorrectionKey]]),
      );
      await db.insert(suggestion).values({
        ...base,
        kind: "correction",
        projectId: current.id,
        data: { changes, base: before },
      });
      return;
    }
    case "update": {
      await findProject(input.projectId);
      if (input.image) await requireOwnImages([input.image], userId);
      await db.insert(suggestion).values({
        ...base,
        kind: "update",
        projectId: input.projectId,
        data: {
          text: input.text,
          sourceUrl: input.sourceUrl,
          image: input.image,
        },
      });
      return;
    }
  }
}

/** Claims a pending suggestion so two moderators never apply it twice. */
async function claim(
  id: string,
  reviewerId: string,
  status: "approved" | "rejected",
  reason = "",
) {
  const [row] = await getDb()
    .update(suggestion)
    .set({ status, reason, reviewerId, reviewedAt: serverNow() })
    .where(and(eq(suggestion.id, id), eq(suggestion.status, "pending")))
    .returning();
  if (row) return row;
  const [exists] = await getDb()
    .select({ id: suggestion.id })
    .from(suggestion)
    .where(eq(suggestion.id, id));
  throw exists
    ? new HttpError(409, "Forslaget er allerede behandlet.")
    : new HttpError(404, "Forslaget finnes ikke.");
}

export async function rejectSuggestion(
  reviewerId: string,
  id: string,
  reason: string,
) {
  await claim(id, reviewerId, "rejected", reason);
}

export async function approveSuggestion(
  reviewerId: string,
  input: {
    id: string;
    title?: string;
    description?: string;
    text?: string;
    keys?: CorrectionKey[];
  },
) {
  const row = await claim(input.id, reviewerId, "approved");
  try {
    await apply(row, input);
  } catch (error) {
    await getDb()
      .update(suggestion)
      .set({ status: "pending", reviewerId: null, reviewedAt: null })
      .where(eq(suggestion.id, row.id));
    throw error;
  }
}

async function apply(
  row: Row,
  input: Parameters<typeof approveSuggestion>[1],
) {
  const [author] = await getDb()
    .select({ username: user.username })
    .from(user)
    .where(eq(user.id, row.userId));
  // Photo credits are the one place the data model names a contributor.
  const credit = author?.username ? `@${author.username}` : undefined;
  const data = row.data;
  if (row.kind === "project" && "project" in data) {
    const next: Project = {
      ...data.project,
      title: input.title ?? data.project.title,
      description: input.description ?? data.project.description,
      imageCredit: data.project.image ? credit : undefined,
      images: data.project.images?.map((photo) => ({ ...photo, credit })),
    };
    await saveProject(projectSchema.parse(next) as Project, true);
    await publishUploads(projectImages(next));
    await getDb()
      .update(suggestion)
      .set({ projectId: next.id })
      .where(eq(suggestion.id, row.id));
    return;
  }
  if (!row.projectId) throw new HttpError(404, "Prosjektet finnes ikke.");
  const current = await findProject(row.projectId);
  if (row.kind === "correction" && "changes" in data) {
    const keys = input.keys ?? (Object.keys(data.changes) as CorrectionKey[]);
    const changes: CorrectionChanges = {};
    for (const key of keys)
      if (key in data.changes) Object.assign(changes, { [key]: data.changes[key] });
    // A drawing and its kind travel together.
    if (changes.geometry || changes.geometryType) {
      changes.geometry = data.changes.geometry ?? current.geometry;
      changes.geometryType = data.changes.geometryType ?? current.geometryType;
    }
    // So do the cover and the further photos.
    if ("image" in changes || "images" in changes) {
      changes.image = data.changes.image ?? current.image;
      changes.images = "images" in data.changes ? data.changes.images : current.images;
    }
    if (!Object.keys(changes).length)
      throw new HttpError(400, "Velg minst én endring.");
    const next = applyChanges(current, changes, credit);
    await saveProject(projectSchema.parse(next) as Project, false);
    await publishUploads(projectImages(next));
    await record(row, { ...data, applied: Object.keys(changes) as CorrectionKey[] });
    return;
  }
  if (row.kind === "update" && "text" in data) {
    const date = serverNow().toISOString();
    const text = input.text ?? data.text;
    const updateId = crypto.randomUUID();
    await saveProject(
      projectSchema.parse({
        ...current,
        updates: [
          {
            id: updateId,
            title: input.title ?? tipTitle(text),
            body: text,
            date,
            sourceUrl: data.sourceUrl,
            images: data.image ? [{ src: data.image, credit }] : undefined,
          },
          ...current.updates,
        ],
      }) as Project,
      false,
    );
    if (data.image) await publishUploads([data.image]);
    await record(row, { ...data, updateId });
    return;
  }
  throw new HttpError(400, "Ugyldig forslag.");
}

/** Keeps what an approval produced, which credits the member. */
async function record(row: Row, data: Row["data"]) {
  await getDb()
    .update(suggestion)
    .set({ data })
    .where(eq(suggestion.id, row.id));
}

/** The member's reviews they haven't seen; returns their ids. */
export async function markSeen(userId: string) {
  const rows = await getDb()
    .update(suggestion)
    .set({ seenAt: serverNow() })
    .where(
      and(
        eq(suggestion.userId, userId),
        isNotNull(suggestion.reviewedAt),
        isNull(suggestion.seenAt),
      ),
    )
    .returning({ id: suggestion.id });
  return new Set(rows.map((row) => row.id));
}

const author = aliasedTable(user, "author");
function select() {
  return getDb()
    .select({
      row: suggestion,
      author: sql<string>`coalesce(${author.username}, 'slettet_bruker')`,
      project: project.data,
    })
    .from(suggestion)
    .innerJoin(author, eq(author.id, suggestion.userId))
    .leftJoin(project, eq(project.id, suggestion.projectId));
}

function toView({
  row,
  author,
  project: current,
}: Awaited<ReturnType<ReturnType<typeof select>["all"]>>[number]): Suggestion {
  const base = {
    id: row.id,
    status: row.status,
    note: row.note,
    reason: row.reason,
    createdAt: row.createdAt.toISOString(),
    reviewedAt: row.reviewedAt?.toISOString(),
    fresh: !!row.reviewedAt && !row.seenAt,
    author,
    projectId: row.projectId ?? undefined,
  };
  const data = row.data;
  if (row.kind === "project" && "project" in data)
    return {
      ...base,
      kind: "project",
      title: current?.title ?? data.project.title,
      data,
    };
  const title = current?.title ?? "Slettet prosjekt";
  if (row.kind === "correction" && "changes" in data)
    return {
      ...base,
      kind: "correction",
      title,
      data,
      project: current ?? undefined,
    };
  return {
    ...base,
    kind: "update",
    title,
    data: data as Extract<Suggestion, { kind: "update" }>["data"],
  };
}

export async function readSuggestions(
  userId: string,
  moderator: boolean,
): Promise<SuggestionLists> {
  const mine = await select()
    .where(eq(suggestion.userId, userId))
    .orderBy(desc(suggestion.createdAt))
    .limit(100);
  if (!moderator) return { mine: mine.map((row) => toView(row)) };
  const [queue, handled] = await Promise.all([
    select()
      .where(eq(suggestion.status, "pending"))
      .orderBy(asc(suggestion.createdAt))
      .limit(200),
    select()
      .where(ne(suggestion.status, "pending"))
      .orderBy(desc(suggestion.reviewedAt))
      .limit(50),
  ]);
  return {
    mine: mine.map((row) => toView(row)),
    queue: queue.map((row) => toView(row)),
    handled: handled.map((row) => toView(row)),
  };
}
