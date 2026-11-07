"use client";
import { createContext, useContext, type ReactNode } from "react";
import { ArrowRight, RotateCcw } from "lucide-react";
import {
  centroid,
  projectPlace,
  statuses,
  type Project,
  unknownDeveloper,
} from "../lib/data";
import { cn } from "../lib/cn";
import { controlBase, fieldControl, primaryButton } from "../lib/ui";

export type FieldId =
  | "title"
  | "description"
  | "status"
  | "year"
  | "category"
  | "place"
  | "developer"
  | "website"
  | "geometry";

const minimumPoints = (project: Project) =>
  project.geometryType === "area" ? 3 : 2;

/** Every editable part of a project: what it stores, how it reads, what's wrong. */
export const fields: Record<
  FieldId,
  {
    label: string;
    keys: (keyof Project)[];
    show: (project: Project) => string;
    error?: (project: Project) => string | undefined;
  }
> = {
  title: {
    label: "Prosjektnavn",
    keys: ["title"],
    show: (p) => p.title,
    error: (p) => (p.title.length < 3 ? "Minst tre tegn" : undefined),
  },
  description: {
    label: "Beskrivelse",
    keys: ["description"],
    show: (p) =>
      p.description.length > 90
        ? `${p.description.slice(0, 90).trimEnd()} …`
        : p.description,
    error: (p) => (p.description ? undefined : "Skriv en beskrivelse"),
  },
  status: {
    label: "Status",
    keys: ["status"],
    show: (p) => statuses[p.status].label,
  },
  year: {
    label: "Ferdig",
    keys: ["year"],
    show: (p) => p.year || "–",
    error: (p) => (/^(\d{4})?$/.test(p.year) ? undefined : "Bruk fire sifre"),
  },
  category: { label: "Kategori", keys: ["category"], show: (p) => p.category },
  place: {
    label: "Sted",
    keys: ["city", "district"],
    show: projectPlace,
    error: (p) => (p.city ? undefined : "Skriv inn et sted"),
  },
  developer: {
    label: "Byggherre",
    keys: ["developer"],
    show: (p) => (p.developer === unknownDeveloper ? "–" : p.developer),
  },
  website: {
    label: "Nettside",
    keys: ["website"],
    show: (p) => p.website || "–",
    error: (p) =>
      !p.website || /^https:\/\/[^\s/]+\.[^\s]+$/.test(p.website)
        ? undefined
        : "Bruk en https-lenke",
  },
  geometry: {
    label: "Kart",
    keys: ["geometry", "geometryType"],
    show: (p) =>
      `${p.geometryType === "area" ? "Område" : "Trasé"} · ${p.geometry.length} punkter`,
    error: (p) =>
      p.geometry.length >= minimumPoints(p)
        ? undefined
        : `Minst ${minimumPoints(p)} punkter`,
  },
};
const fieldOrder = Object.keys(fields) as FieldId[];

/** Fallback values read as empty fields while editing. */
export function toDraft(project: Project): Project {
  return {
    ...project,
    district: project.district === project.city ? "" : project.district,
    developer: project.developer === unknownDeveloper ? "" : project.developer,
  };
}

/** What a draft saves as: trimmed, with the fallbacks new projects get. */
export function finalize(project: Project): Project {
  const city = project.city.trim();
  return {
    ...project,
    title: project.title.trim(),
    description: project.description.trim(),
    city,
    district: project.district.trim() || city,
    year: project.year.trim(),
    developer: project.developer.trim() || unknownDeveloper,
    website: project.website?.trim() || undefined,
  };
}

const same = (a: Project, b: Project, id: FieldId) =>
  fields[id].keys.every(
    (key) => JSON.stringify(a[key]) === JSON.stringify(b[key]),
  );

export function changedFields(draft: Project, original: Project) {
  const next = finalize(draft);
  const saved = finalize(original);
  return fieldOrder.filter((id) => !same(next, saved, id));
}

function fieldError(draft: Project, id: FieldId) {
  return fields[id].error?.(finalize(draft));
}

/** The changed fields of a draft, ready to lay over the saved project. */
export function changesToSave(draft: Project, changed: FieldId[]) {
  const next = finalize(draft);
  const patch: Partial<Project> = {};
  for (const id of changed)
    for (const key of fields[id].keys)
      Object.assign(patch, { [key]: next[key] });
  if (changed.includes("geometry")) patch.center = centroid(next.geometry);
  return patch;
}

type ProjectEdit = {
  draft: Project;
  original: Project;
  /** `changedFields(draft, original)`, computed once per render. */
  changed: FieldId[];
  change: (patch: Partial<Project>) => void;
  revert: (id: FieldId) => void;
};
export const ProjectEditContext = createContext<ProjectEdit | null>(null);
/** The open edit session, or null outside edit mode. */
export const useProjectEdit = () => useContext(ProjectEditContext);

/** Tints a control inside a changed or invalid `EditField`. */
export const editState = cn(
  "in-data-changed:border-accent/60 in-data-changed:bg-accent/5",
  "in-data-invalid:border-danger",
);

export const editInput = cn(
  fieldControl,
  editState,
  "min-h-9 rounded-lg px-2.5 text-ui font-normal",
  "pointer-coarse:min-h-11 pointer-coarse:text-base max-sm:text-base",
);

function RevertButton({
  id,
  className,
}: {
  id: FieldId;
  className?: string;
}) {
  const edit = useProjectEdit();
  return (
    <button
      type="button"
      className={cn(
        "inline-flex size-7 shrink-0 items-center justify-center rounded-md text-accent",
        "transition-colors hover:bg-accent/10 hover:text-accent-strong motion-reduce:transition-none",
        "pointer-coarse:size-9",
        className,
      )}
      aria-label={`Tilbakestill ${fields[id].label.toLowerCase()}`}
      data-tooltip="Tilbakestill"
      onClick={() => edit?.revert(id)}
    >
      <RotateCcw size={14} aria-hidden="true" />
    </button>
  );
}

/**
 * One editable part. Changed fields are tinted with a revert button; fields
 * that can't be saved say why.
 */
export function EditField({
  id,
  label,
  inline = false,
  wide = false,
  className,
  children,
}: {
  id: FieldId;
  /** Overrides the field's label (e.g. "Ferdigstilt"). */
  label?: string;
  /** No label row; the revert button sits beside the control. */
  inline?: boolean;
  /** Spans both columns of the fact grid. */
  wide?: boolean;
  className?: string;
  children: ReactNode;
}) {
  const edit = useProjectEdit();
  if (!edit) return null;
  const changed = edit.changed.includes(id);
  const error = fieldError(edit.draft, id);
  return (
    <div
      className={cn(wide && "col-span-full", className)}
      data-changed={changed || undefined}
      data-invalid={error ? true : undefined}
      data-wide={wide || undefined}
    >
      {inline ? (
        <div className="flex items-start gap-1">
          <div className="min-w-0 flex-1">{children}</div>
          {changed && <RevertButton id={id} />}
        </div>
      ) : (
        <>
          <div className="mb-0.5 flex min-h-7 items-center gap-1.5 text-xs leading-normal font-medium text-muted">
            <span className={cn(changed && "text-ink")}>
              {label ?? fields[id].label}
            </span>
            {changed && (
              <>
                <small className="text-2xs font-semibold text-accent">
                  Endret
                </small>
                <RevertButton id={id} className="-my-1 -mr-1.75 ml-auto" />
              </>
            )}
          </div>
          {children}
        </>
      )}
      {error && (
        <p className="mt-1 text-xs leading-normal text-danger">{error}</p>
      )}
    </div>
  );
}

const barButton = cn(
  controlBase,
  "min-h-9 rounded-lg px-3 text-ui pointer-coarse:min-h-11",
);
const quietBarButton = cn(
  barButton,
  "border border-transparent font-medium text-muted hover:bg-ink/[0.06] hover:text-ink",
);
const dangerBarButton = cn(
  barButton,
  "border border-danger bg-danger text-white hover:border-danger-strong hover:bg-danger-strong",
);

const barRow = "flex items-center gap-1.5";
const barStatus = "text-ui font-medium text-ink";

export type EditStage = "edit" | "review" | "discard";

/**
 * Pinned to the bottom while editing: the change count, then a review of
 * every change before anything is saved, or a check before discarding.
 */
export function EditBar({
  stage,
  saving,
  onStage,
  onConfirm,
  onDiscard,
  suggestion,
}: {
  stage: EditStage;
  saving: boolean;
  onStage: (stage: EditStage) => void;
  onConfirm: () => void;
  onDiscard: () => void;
  /** Members send their changes as a suggestion, with an optional note. */
  suggestion?: { note: string; onNote: (note: string) => void };
}) {
  const edit = useProjectEdit();
  if (!edit) return null;
  const { changed } = edit;
  const invalid = fieldOrder.filter((id) => fieldError(edit.draft, id));
  const count = `${changed.length} ${changed.length === 1 ? "endring" : "endringer"}`;
  const reviewing = stage === "review" && changed.length > 0;
  return (
    <div
      className="sticky bottom-0 z-30 border-t border-border bg-surface px-7 pt-3 pb-[calc(12px+env(safe-area-inset-bottom))] shadow-bar max-md:px-4.5"
      role="region"
      aria-label="Redigering"
      data-stage={reviewing ? "review" : stage}
      data-base-ui-swipe-ignore
    >
      {reviewing ? (
        <>
          <h2 className="text-body font-semibold">
            {suggestion ? "Foreslå" : "Lagre"} {count}?
          </h2>
          <ul
            className="mt-2 mb-3 max-h-[min(40dvh,280px)] overflow-y-auto border-t border-border"
            aria-label="Endringer"
          >
            {changed.map((id) => (
              // Narrow screens put the label above the values.
              <li
                key={id}
                className="grid min-h-10 grid-cols-[120px_minmax(0,1fr)_auto] items-center gap-3 border-b border-border py-1 text-ui max-md:grid-cols-[minmax(0,1fr)_auto] max-md:gap-x-2 max-md:gap-y-0.5 max-md:py-2"
              >
                <span className="text-muted max-md:col-span-full max-md:text-xs max-md:leading-normal">
                  {fields[id].label}
                </span>
                <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 wrap-anywhere [&>svg]:shrink-0 [&>svg]:text-muted">
                  <del className="text-muted">
                    {fields[id].show(edit.original)}
                  </del>
                  <ArrowRight size={13} aria-label="til" />
                  <ins className="font-medium text-accent-strong no-underline">
                    {fields[id].show(finalize(edit.draft))}
                  </ins>
                </span>
                <RevertButton id={id} />
              </li>
            ))}
          </ul>
          {suggestion && (
            <textarea
              className={cn(
                fieldControl,
                "mb-3 block min-h-16 resize-y rounded-lg px-2.5 py-2 text-ui max-sm:text-base",
              )}
              aria-label="Merknad"
              placeholder="Merknad (valgfritt)"
              maxLength={500}
              rows={2}
              value={suggestion.note}
              onChange={(event) => suggestion.onNote(event.target.value)}
            />
          )}
          <div className={barRow}>
            <button
              type="button"
              className={cn(quietBarButton, "mr-auto")}
              onClick={() => onStage("edit")}
            >
              Tilbake
            </button>
            <button
              type="button"
              className={cn(primaryButton, barButton)}
              disabled={saving}
              onClick={onConfirm}
            >
              {suggestion
                ? saving
                  ? "Sender …"
                  : "Send forslag"
                : saving
                  ? "Lagrer …"
                  : "Bekreft og lagre"}
            </button>
          </div>
        </>
      ) : stage === "discard" ? (
        <div className={barRow}>
          <p className={cn(barStatus, "mr-auto")}>Forkaste {count}?</p>
          <button
            type="button"
            className={quietBarButton}
            onClick={() => onStage("edit")}
          >
            Fortsett
          </button>
          <button type="button" className={dangerBarButton} onClick={onDiscard}>
            Forkast
          </button>
        </div>
      ) : (
        <div className={barRow}>
          <p
            className={cn(barStatus, "mr-auto data-invalid:text-danger")}
            data-invalid={invalid.length > 0 || undefined}
            role="status"
          >
            {invalid.length
              ? `${invalid.length} ${invalid.length === 1 ? "felt" : "felter"} må rettes`
              : changed.length
                ? count
                : "Ingen endringer"}
          </p>
          <button
            type="button"
            className={quietBarButton}
            onClick={() => (changed.length ? onStage("discard") : onDiscard())}
          >
            Avbryt
          </button>
          <button
            type="button"
            className={cn(primaryButton, barButton)}
            disabled={!changed.length || invalid.length > 0}
            onClick={() => onStage("review")}
          >
            {suggestion ? "Send" : "Lagre"}
          </button>
        </div>
      )}
    </div>
  );
}
