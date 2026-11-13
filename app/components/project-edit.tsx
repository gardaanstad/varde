"use client";
import { createContext, useContext, type ReactNode } from "react";
import { AlertCircle, ArrowRight, RotateCcw } from "lucide-react";
import {
  categoryLabels,
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
  | "categories"
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
  categories: {
    label: "Kategori",
    keys: ["categories"],
    show: (p) => categoryLabels(p.categories).join(", "),
    error: (p) => (p.categories.length ? undefined : "Velg en kategori"),
  },
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

/** The fields of a draft that can't be saved as they are, in form order. */
export function invalidFields(draft: Project) {
  return fieldOrder.filter((id) => fieldError(draft, id));
}

/** Scrolls a field into view and puts the cursor in it. */
export function focusField(id: FieldId, root: ParentNode = document) {
  const field = root.querySelector(`[data-field="${id}"]`);
  if (!field) return;
  field.scrollIntoView({
    block: "center",
    behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
      ? "auto"
      : "smooth",
  });
  field
    .querySelector<HTMLElement>(
      "input, textarea, select, button:not([data-revert])",
    )
    ?.focus({ preventScroll: true });
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
      data-revert=""
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
      data-field={id}
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
  "min-h-9 rounded-lg px-3.5 text-ui pointer-coarse:min-h-11",
);
export const primaryBarButton = cn(primaryButton, barButton);
export const quietBarButton = cn(
  barButton,
  "border border-transparent font-medium text-muted hover:bg-ink/[0.06] hover:text-ink",
);
export const dangerBarButton = cn(
  barButton,
  "border border-danger bg-danger text-on-danger hover:border-danger-strong hover:bg-danger-strong",
);
/** The bar pinned under a form: status on the left, actions on the right. */
export const actionBar = cn(
  "sticky bottom-0 z-30 border-t border-border bg-surface px-6 pt-3 pb-[calc(12px+env(safe-area-inset-bottom))] shadow-bar max-md:px-4.5",
);
export const barRow = "flex min-h-9 items-center gap-1.5 pointer-coarse:min-h-11";
const barStatus = "mr-auto min-w-0 truncate text-ui font-medium text-ink";
/** A status that jumps to the first field needing attention. */
export const barProblem = cn(
  "mr-auto inline-flex min-h-9 min-w-0 items-center gap-1.5 rounded-lg px-2 -ml-2 text-ui font-medium text-danger",
  "hover:bg-danger-soft pointer-coarse:min-h-11 [&>svg]:shrink-0",
);

export type EditStage = "edit" | "review" | "discard";

const plural = (count: number, one: string, many: string) =>
  `${count} ${count === 1 ? one : many}`;

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
  const invalid = invalidFields(edit.draft);
  const count = plural(changed.length, "endring", "endringer");
  const reviewing = stage === "review" && changed.length > 0;
  return (
    <div
      className={actionBar}
      role="region"
      aria-label="Redigering"
      data-stage={reviewing ? "review" : stage}
      data-base-ui-swipe-ignore
    >
      {reviewing ? (
        <div className="motion-safe:animate-preview-in">
          <h2 className="flex min-h-8 items-center text-body font-semibold">
            {suggestion ? "Foreslå" : "Lagre"} {count}?
          </h2>
          <ul
            className="mt-1.5 mb-3 max-h-[min(42dvh,320px)] divide-y divide-border overflow-y-auto overscroll-contain rounded-xl border border-border [scrollbar-width:thin]"
            aria-label="Endringer"
          >
            {changed.map((id) => (
              <li
                key={id}
                className="flex items-center gap-2 py-2 pr-1.5 pl-3"
              >
                <div className="min-w-0 flex-1">
                  {/* Opens the field to adjust it further. */}
                  <button
                    type="button"
                    className="-mx-1 rounded px-1 text-xs leading-normal font-medium text-muted hover:text-ink hover:underline hover:underline-offset-2"
                    onClick={() => {
                      onStage("edit");
                      requestAnimationFrame(() => focusField(id));
                    }}
                  >
                    {fields[id].label}
                  </button>
                  <p className="flex flex-wrap items-baseline gap-x-1.5 text-ui leading-snug wrap-anywhere">
                    <del className="text-muted decoration-muted/60">
                      {fields[id].show(edit.original)}
                    </del>
                    <ArrowRight
                      size={12}
                      className="shrink-0 self-center text-muted"
                      aria-label="til"
                    />
                    <ins className="font-medium text-ink no-underline">
                      {fields[id].show(finalize(edit.draft))}
                    </ins>
                  </p>
                </div>
                <RevertButton id={id} />
              </li>
            ))}
          </ul>
          {suggestion && (
            <textarea
              className={cn(
                fieldControl,
                "mb-3 block field-sizing-content min-h-16 max-h-40 resize-none rounded-lg px-3 py-2 text-ui max-sm:text-base",
              )}
              aria-label="Merknad"
              placeholder="Merknad til moderator (valgfritt)"
              maxLength={500}
              rows={2}
              value={suggestion.note}
              onChange={(event) => suggestion.onNote(event.target.value)}
            />
          )}
          <div className={barRow}>
            <button
              type="button"
              className={cn(quietBarButton, "-ml-3.5 mr-auto")}
              onClick={() => onStage("edit")}
            >
              Tilbake
            </button>
            <button
              type="button"
              className={primaryBarButton}
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
        </div>
      ) : stage === "discard" ? (
        <div className={barRow}>
          <p className={barStatus}>Forkaste {count}?</p>
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
          <div className="mr-auto flex min-w-0" role="status">
            {invalid.length ? (
              <button
                type="button"
                className={barProblem}
                onClick={() => focusField(invalid[0])}
              >
                <AlertCircle size={15} aria-hidden="true" />
                <span className="truncate">
                  {plural(invalid.length, "felt", "felter")} må rettes
                </span>
              </button>
            ) : (
              <p className={cn(barStatus, !changed.length && "text-muted")}>
                {changed.length ? count : "Ingen endringer"}
              </p>
            )}
          </div>
          <button
            type="button"
            className={quietBarButton}
            onClick={() => (changed.length ? onStage("discard") : onDiscard())}
          >
            Avbryt
          </button>
          <button
            type="button"
            className={primaryBarButton}
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
