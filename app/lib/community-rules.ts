import { z } from "zod";
import { categories } from "./data";
export const id = z.string().min(1).max(100);
export const sourceUrl = z
  .url()
  .max(2000)
  .refine((url) => url.startsWith("https://"), "Bruk en https-lenke.");
const point = z.tuple([
  z.number().min(-90).max(90),
  z.number().min(-180).max(180),
]);
/** Bundled example photos, or images uploaded through /api/uploads. */
export const image = z
  .string()
  .regex(/^(\/images\/[a-z0-9-]+\.(jpg|png|webp)|\/api\/uploads\/[a-f0-9]{32})$/);
const photo = z.object({
  src: image,
  alt: z.string().max(300).optional(),
  credit: z.string().max(300).optional(),
});
export const projectFields = z.object({
  id,
  title: z.string().trim().min(3).max(160),
  district: z.string().trim().max(100),
  city: z.string().trim().min(1).max(100),
  category: z.enum(categories),
  status: z.enum(["planned", "construction", "completed"]),
  image: z.union([image, z.literal("")]),
  images: z.array(photo).max(20).optional(),
  imageCredit: z.string().max(300).optional(),
  imageSource: z
    .url()
    .refine((url) => url.startsWith("https://"))
    .optional(),
  website: sourceUrl.optional(),
  example: z.boolean().optional(),
  description: z.string().trim().min(1).max(10_000),
  center: point,
  geometry: z.array(point).min(2).max(2000),
  geometryType: z.enum(["area", "line"]),
  year: z.string().max(30),
  updated: z.string().min(1).max(40),
  comments: z.number().int().nonnegative(),
  developer: z.string().max(200),
  updates: z
    .array(
      z.object({
        id,
        title: z.string().trim().min(1).max(200),
        body: z.string().trim().min(1).max(10_000),
        date: z.string().min(1).max(40),
        origin: z.boolean().optional(),
        sourceUrl: sourceUrl.optional(),
        images: z.array(photo).max(10).optional(),
      }),
    )
    .max(500),
});
export const projectSchema = projectFields.refine(
  (p) => p.geometryType !== "area" || p.geometry.length >= 3,
  "Et område trenger minst tre punkter.",
);
export const mutationSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("comment"),
    projectId: id,
    updateId: id.optional(),
    text: z.string().trim().min(1, "Skriv en kommentar først.").max(2000),
    parentId: id.optional(),
  }),
  z.object({
    action: z.literal("follow"),
    projectId: id,
    following: z.boolean(),
  }),
  z.object({
    action: z.literal("vote"),
    commentId: id,
    value: z.union([z.literal(-1), z.literal(0), z.literal(1)]),
  }),
  z.object({
    action: z.literal("project"),
    project: projectSchema,
    create: z.boolean(),
  }),
]);
export type CommunityMutation = z.input<typeof mutationSchema>;
