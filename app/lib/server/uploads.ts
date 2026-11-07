import "server-only";
import { and, eq, inArray, or } from "drizzle-orm";
import { getDb } from "../db/client";
import { upload } from "../db/schema";
import { HttpError } from "./http";

/** Browsers resize before uploading, so this only stops abuse. */
export const maxUploadBytes = 4 * 1024 * 1024;
const signatures: Record<string, (bytes: Uint8Array) => boolean> = {
  "image/jpeg": (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  "image/png": (b) =>
    b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47,
  "image/webp": (b) =>
    String.fromCharCode(...b.slice(0, 4)) === "RIFF" &&
    String.fromCharCode(...b.slice(8, 12)) === "WEBP",
};

/** `visible` is false for members' photos until a moderator approves them. */
export async function saveUpload(file: File, userId: string, visible = true) {
  if (file.size > maxUploadBytes)
    throw new HttpError(413, "Bildet er for stort.");
  const bytes = new Uint8Array(await file.arrayBuffer());
  // The stored type comes from the bytes, never from the client's label.
  const type = Object.keys(signatures).find((key) => signatures[key](bytes));
  if (!type) throw new HttpError(415, "Bruk et JPEG-, PNG- eller WebP-bilde.");
  const id = crypto.randomUUID().replaceAll("-", "");
  await getDb()
    .insert(upload)
    .values({
      id,
      type,
      data: Buffer.from(bytes),
      userId,
      createdAt: new Date(),
      public: visible,
    });
  return `/api/uploads/${id}`;
}

export async function readUpload(id: string) {
  if (!/^[a-f0-9]{32}$/.test(id)) return undefined;
  const [row] = await getDb()
    .select({
      type: upload.type,
      data: upload.data,
      public: upload.public,
      userId: upload.userId,
    })
    .from(upload)
    .where(eq(upload.id, id));
  return row;
}

const uploadId = (src: string) => src.match(/^\/api\/uploads\/([a-f0-9]{32})$/)?.[1];

/** Members may only reference their own or already public photos. */
export async function requireOwnImages(srcs: string[], userId: string) {
  const ids = srcs.map(uploadId).filter((id): id is string => !!id);
  if (!ids.length) return;
  const rows = await getDb()
    .select({ id: upload.id })
    .from(upload)
    .where(
      and(
        inArray(upload.id, ids),
        or(eq(upload.public, true), eq(upload.userId, userId)),
      ),
    );
  if (rows.length !== new Set(ids).size)
    throw new HttpError(400, "Bildet finnes ikke.");
}

/** Approved suggestions make their photos visible to everyone. */
export async function publishUploads(srcs: string[]) {
  const ids = srcs.map(uploadId).filter((id): id is string => !!id);
  if (ids.length)
    await getDb()
      .update(upload)
      .set({ public: true })
      .where(inArray(upload.id, ids));
}
