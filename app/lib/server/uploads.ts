import "server-only";
import { eq } from "drizzle-orm";
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

export async function saveUpload(file: File, userId: string) {
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
    });
  return `/api/uploads/${id}`;
}

export async function readUpload(id: string) {
  if (!/^[a-f0-9]{32}$/.test(id)) return undefined;
  const [row] = await getDb()
    .select({ type: upload.type, data: upload.data })
    .from(upload)
    .where(eq(upload.id, id));
  return row;
}
