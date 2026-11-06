"use client";
import { errorMessage } from "./api-client";

const maxEdge = 2000;

/** Downscales to at most 2000px and re-encodes, so uploads stay small. */
async function shrink(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file, {
    imageOrientation: "from-image",
  });
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const encode = (type: string) =>
    new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, type, 0.85),
    );
  // Safari can't encode WebP and quietly returns PNG instead.
  const webp = await encode("image/webp");
  if (webp?.type === "image/webp") return webp;
  const jpeg = await encode("image/jpeg");
  if (!jpeg) throw new Error("Kunne ikke lese bildet.");
  return jpeg;
}

/** Uploads an image and returns its URL. Moderators only. */
export async function uploadImage(file: File): Promise<string> {
  let image: Blob;
  try {
    image = await shrink(file);
  } catch (error) {
    throw new Error(errorMessage(error, "Kunne ikke lese bildet."));
  }
  const form = new FormData();
  form.append("file", image);
  const response = await fetch("/api/uploads", { method: "POST", body: form });
  const data = await response.json().catch(() => null);
  if (!response.ok)
    throw new Error(data?.error || "Kunne ikke laste opp bildet.");
  return data.src as string;
}
