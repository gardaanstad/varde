import { z } from "zod";
import { id, image, projectFields, projectSchema, sourceUrl } from "./community-rules";
import { centroid, type Project } from "./data";

export type SuggestionKind = "project" | "correction" | "update";
export type SuggestionStatus = "pending" | "approved" | "rejected";

/** Project fields a correction may change. */
export const correctionKeys = [
  "title",
  "description",
  "status",
  "year",
  "category",
  "city",
  "district",
  "developer",
  "website",
  "geometry",
  "geometryType",
  "center",
] as const;
export type CorrectionKey = (typeof correctionKeys)[number];
/** An empty website means the link is removed. */
export type CorrectionChanges = Partial<Pick<Project, CorrectionKey>>;

export type SuggestionData =
  | { project: Project }
  | { changes: CorrectionChanges; base: CorrectionChanges }
  | { text: string; sourceUrl: string; image?: string };

type SuggestionBase = {
  id: string;
  status: SuggestionStatus;
  note: string;
  reason: string;
  createdAt: string;
  reviewedAt?: string;
  author: string;
  /** The existing project, or the published one once a new project is approved. */
  projectId?: string;
  title: string;
};
export type Suggestion = SuggestionBase &
  (
    | { kind: "project"; data: { project: Project } }
    | {
        kind: "correction";
        data: { changes: CorrectionChanges; base: CorrectionChanges };
        /** The project as it is now. */
        project?: Project;
      }
    | {
        kind: "update";
        data: { text: string; sourceUrl: string; image?: string };
      }
  );
export type SuggestionLists = {
  mine: Suggestion[];
  /** Moderators only. */
  queue?: Suggestion[];
  handled?: Suggestion[];
};

export const kindLabels: Record<SuggestionKind, string> = {
  project: "Nytt prosjekt",
  correction: "Rettelse",
  update: "Tips",
};
export const statusLabels: Record<SuggestionStatus, string> = {
  pending: "Venter",
  approved: "Godkjent",
  rejected: "Avvist",
};

/** A tip's update headline: its first sentence or line, shortened. */
export function tipTitle(text: string) {
  const first = text.trim().split(/(?<=[.!?])\s|\n/)[0].trim();
  return first.length > 80 ? `${first.slice(0, 79).trimEnd()}…` : first;
}

/** Lays changes over a project the way a moderator's edit would save. */
export function applyChanges(current: Project, changes: CorrectionChanges): Project {
  const next = { ...current, ...changes };
  if ("website" in changes) next.website = changes.website || undefined;
  if (changes.city !== undefined || changes.district !== undefined)
    next.district = next.district.trim() || next.city;
  if (changes.geometry) next.center = centroid(changes.geometry);
  return next;
}

const note = z.string().trim().max(500).default("");
const correctionFields = projectFields
  .pick({
    title: true,
    description: true,
    status: true,
    year: true,
    category: true,
    city: true,
    district: true,
    developer: true,
    geometry: true,
    geometryType: true,
    center: true,
  })
  .extend({ website: z.union([sourceUrl, z.literal("")]) })
  .partial()
  .strict();

export const submitSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("project"), project: projectSchema, note }),
  z.object({
    kind: z.literal("correction"),
    projectId: id,
    changes: correctionFields,
    note,
  }),
  z.object({
    kind: z.literal("update"),
    projectId: id,
    text: z.string().trim().min(1, "Skriv tipset først.").max(2000),
    sourceUrl,
    image: image.optional(),
  }),
]);
export type SuggestionInput = z.input<typeof submitSchema>;

export const suggestionMutationSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("submit"), suggestion: submitSchema }),
  z.object({
    action: z.literal("approve"),
    id,
    /** Edit-then-approve: overrides for a new project or a tip. */
    title: z.string().trim().min(3).max(200).optional(),
    description: z.string().trim().min(1).max(10_000).optional(),
    text: z.string().trim().min(1).max(10_000).optional(),
    /** A correction's fields to apply; all of them when omitted. */
    keys: z.array(z.enum(correctionKeys)).min(1).optional(),
  }),
  z.object({
    action: z.literal("reject"),
    id,
    reason: z.string().trim().max(300).default(""),
  }),
]);
export type SuggestionMutation = z.input<typeof suggestionMutationSchema>;
