"use client";
import {
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import { AlertCircle } from "lucide-react";
import {
  centroid,
  presetPlaces,
  type Project,
  type Status,
  statuses,
  statusOrder,
} from "../lib/data";
import { errorMessage } from "../lib/api-client";
import { cn } from "../lib/cn";
import { fieldControl } from "../lib/ui";
import ImagePicker from "./image-picker";
import CategoryPicker from "./category-picker";
import DrawingMap from "./drawing-map";
import { PanelHeader } from "./panel";
import {
  actionBar,
  barProblem,
  barRow,
  dangerBarButton,
  type FieldId,
  fields,
  finalize,
  focusField,
  invalidFields,
  primaryBarButton,
  quietBarButton,
} from "./project-edit";

const input = cn(
  fieldControl,
  "min-h-10 rounded-lg px-3 text-ui pointer-coarse:min-h-11 max-sm:text-base",
  "aria-invalid:border-danger aria-invalid:focus:border-danger aria-invalid:focus:ring-danger/12",
);

const blank: Project = {
  id: "",
  title: "",
  description: "",
  website: "",
  city: "Oslo",
  district: "",
  categories: [],
  status: "planned",
  year: "",
  developer: "",
  center: [0, 0],
  geometry: [],
  geometryType: "area",
  image: "",
  comments: 0,
  updated: "",
  updates: [],
};

/** A labelled control; its error shows once saving has been tried. */
function Field({
  id,
  label,
  control,
  optional = false,
  error,
  className,
  children,
}: {
  /** Where "fix this" jumps to: a field id, or any name for the rest. */
  id: string;
  label: string;
  /** The labelled control's id; groups without one get a plain heading. */
  control?: string;
  optional?: boolean;
  error?: string;
  className?: string;
  children: ReactNode;
}) {
  const Label = control ? "label" : "span";
  return (
    <div className={className} data-field={id}>
      <Label
        htmlFor={control}
        className="mb-1.5 flex items-baseline gap-1.5 text-xs leading-normal font-medium text-ink"
      >
        {label}
        {optional && <span className="font-normal text-muted">Valgfritt</span>}
      </Label>
      {children}
      {error && (
        <p
          id={control && `${control}-error`}
          className="mt-1.5 flex items-center gap-1 text-xs leading-normal text-danger [&>svg]:shrink-0"
        >
          <AlertCircle size={13} aria-hidden="true" />
          {error}
        </p>
      )}
    </div>
  );
}

/**
 * A new project, or a member's suggestion of one: a panel in the explorer.
 * Closing it with something written asks first; the panel's close button
 * goes through `closeRef`.
 */
export default function ProjectEditor({
  onClose,
  onSave,
  closeRef,
  dirtyRef,
  initial,
  suggest = false,
}: {
  onClose: () => void;
  onSave: (project: Project) => Promise<void>;
  closeRef: RefObject<(() => void) | null>;
  /** Whether anything has been written since it opened. */
  dirtyRef?: RefObject<(() => boolean) | null>;
  /** A head start, such as a railway from OpenStreetMap. */
  initial?: Partial<Project>;
  /** A member's suggestion, which waits for a moderator. */
  suggest?: boolean;
}) {
  const [start] = useState(() => ({ ...blank, ...initial }));
  const [draft, setDraft] = useState(start);
  const [images, setImages] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  // Errors wait until saving is first tried, then follow every edit.
  const [attempted, setAttempted] = useState(false);
  const [discarding, setDiscarding] = useState(false);
  const form = useRef<HTMLFormElement>(null);
  const ids = useId();
  const change = (patch: Partial<Project>) =>
    setDraft((current) => ({ ...current, ...patch }));
  const invalid = attempted ? invalidFields(draft) : [];
  const error = (id: FieldId) =>
    invalid.includes(id) ? fields[id].error?.(finalize(draft)) : undefined;
  /** Props tying a control to its label and error. */
  const control = (id: FieldId) => ({
    id: `${ids}-${id}`,
    "aria-invalid": error(id) ? true : undefined,
    "aria-describedby": error(id) ? `${ids}-${id}-error` : undefined,
  });

  async function save() {
    if (saving || uploading) return;
    setAttempted(true);
    const problems = invalidFields(draft);
    if (problems.length) {
      if (form.current) focusField(problems[0], form.current);
      return;
    }
    const project = finalize(draft);
    const [cover = "", ...more] = images;
    setSaving(true);
    setSaveError("");
    try {
      await onSave({
        ...project,
        id: `prosjekt-${crypto.randomUUID().slice(0, 8)}`,
        center: centroid(project.geometry),
        image: cover,
        images: more.length
          ? more.map((src) => ({ src, alt: project.title }))
          : undefined,
        updated: new Date().toISOString(),
      });
    } catch (failure) {
      setSaveError(errorMessage(failure, "Kunne ikke lagre prosjektet."));
    } finally {
      setSaving(false);
    }
  }
  const written = () =>
    images.length > 0 || JSON.stringify(draft) !== JSON.stringify(start);
  function close() {
    if (written()) setDiscarding(true);
    else onClose();
  }
  useLayoutEffect(() => {
    closeRef.current = close;
    if (dirtyRef) dirtyRef.current = written;
  });

  return (
    <>
    <PanelHeader title={suggest ? "Foreslå prosjekt" : "Nytt prosjekt"} />
    <div
      className="min-h-0 flex-1 overflow-y-auto overscroll-contain scrollbar-thin"
      data-project-editor=""
      data-drawer-scroll
    >
      <form
        ref={form}
        noValidate
        className="flex min-h-full flex-col"
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        <div className="flex flex-1 flex-col gap-5 px-4.5 pt-3 pb-8 md:px-gutter-scroll">
          <Field
            id="title"
            label="Prosjektnavn"
            control={`${ids}-title`}
            error={error("title")}
          >
            <input
              {...control("title")}
              className={input}
              maxLength={100}
              autoFocus={!start.title}
              autoComplete="off"
              value={draft.title}
              onChange={(event) => change({ title: event.target.value })}
            />
          </Field>
          <Field
            id="description"
            label="Beskrivelse"
            control={`${ids}-description`}
            error={error("description")}
          >
            <textarea
              {...control("description")}
              className={cn(
                input,
                "block field-sizing-content min-h-28 resize-none py-2.5 leading-relaxed",
              )}
              maxLength={5000}
              autoFocus={Boolean(start.title) && !start.description}
              value={draft.description}
              onChange={(event) => change({ description: event.target.value })}
            />
          </Field>
          <Field id="images" label="Bilder" optional>
            <ImagePicker
              value={images}
              onChange={setImages}
              onBusy={setUploading}
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field id="status" label="Status" control={`${ids}-status`}>
              <select
                {...control("status")}
                className={input}
                value={draft.status}
                onChange={(event) =>
                  change({ status: event.target.value as Status })
                }
              >
                {statusOrder.map((status) => (
                  <option value={status} key={status}>
                    {statuses[status].label}
                  </option>
                ))}
              </select>
            </Field>
            <Field
              id="year"
              label={draft.status === "completed" ? "Ferdigstilt" : "Ferdigstilles"}
              control={`${ids}-year`}
              optional
              error={error("year")}
            >
              <input
                {...control("year")}
                className={input}
                inputMode="numeric"
                maxLength={4}
                placeholder="2030"
                value={draft.year}
                onChange={(event) => change({ year: event.target.value })}
              />
            </Field>
          </div>
          <Field id="categories" label="Kategori" error={error("categories")}>
            <CategoryPicker
              triggerClassName={cn(
                "min-h-10 rounded-lg border-border-strong px-3 pointer-coarse:min-h-11 max-sm:text-base",
                error("categories") && "border-danger",
              )}
              value={draft.categories}
              onChange={(categories) => change({ categories })}
            />
          </Field>
          <Field
            id="developer"
            label="Byggherre"
            control={`${ids}-developer`}
            optional
          >
            <input
              {...control("developer")}
              className={input}
              maxLength={100}
              value={draft.developer}
              onChange={(event) => change({ developer: event.target.value })}
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field
              id="place"
              label="Sted"
              control={`${ids}-place`}
              error={error("place")}
            >
              <input
                {...control("place")}
                className={input}
                list={`${ids}-places`}
                maxLength={80}
                value={draft.city}
                onChange={(event) => change({ city: event.target.value })}
              />
              <datalist id={`${ids}-places`}>
                {presetPlaces.map((place) => (
                  <option key={place} value={place} />
                ))}
              </datalist>
            </Field>
            <Field
              id="district"
              label="Område / bydel"
              control={`${ids}-district`}
              optional
            >
              <input
                id={`${ids}-district`}
                className={input}
                maxLength={80}
                placeholder="F.eks. Bjørvika"
                value={draft.district}
                onChange={(event) => change({ district: event.target.value })}
              />
            </Field>
          </div>
          <Field
            id="website"
            label="Prosjektlenke"
            control={`${ids}-website`}
            optional
            error={error("website")}
          >
            <input
              {...control("website")}
              className={input}
              type="url"
              inputMode="url"
              maxLength={2000}
              placeholder="https://…"
              value={draft.website}
              onChange={(event) => change({ website: event.target.value })}
            />
          </Field>
          <Field id="geometry" label="Kart" error={error("geometry")}>
            <DrawingMap
              city={draft.city.trim() || "Oslo"}
              points={draft.geometry}
              shape={draft.geometryType}
              onPointsChange={(geometry) => change({ geometry })}
              onShapeChange={(geometryType) => change({ geometryType })}
              frameClassName={error("geometry") && "border-danger"}
            />
          </Field>
        </div>
        <div className={actionBar} data-base-ui-swipe-ignore>
          {discarding ? (
            <div className={barRow}>
              <p className="mr-auto min-w-0 truncate text-ui font-medium text-ink">
                Forkaste utkastet?
              </p>
              <button
                type="button"
                className={quietBarButton}
                onClick={() => setDiscarding(false)}
              >
                Fortsett
              </button>
              <button
                type="button"
                className={dangerBarButton}
                onClick={onClose}
              >
                Forkast
              </button>
            </div>
          ) : (
            <div className={barRow}>
              <div className="mr-auto flex min-w-0" role="status">
                {saveError ? (
                  <p className="truncate text-ui font-medium text-danger">
                    {saveError}
                  </p>
                ) : (
                  invalid.length > 0 && (
                    <button
                      type="button"
                      className={barProblem}
                      onClick={() =>
                        form.current && focusField(invalid[0], form.current)
                      }
                    >
                      <AlertCircle size={15} aria-hidden="true" />
                      <span className="truncate">
                        {invalid.length}{" "}
                        {invalid.length === 1 ? "felt" : "felter"} må rettes
                      </span>
                    </button>
                  )
                )}
              </div>
              <button type="button" className={quietBarButton} onClick={close}>
                Avbryt
              </button>
              <button
                type="submit"
                className={primaryBarButton}
                disabled={saving || uploading}
              >
                {saving
                  ? suggest
                    ? "Sender …"
                    : "Lagrer …"
                  : suggest
                    ? "Send forslag"
                    : "Legg til prosjekt"}
              </button>
            </div>
          )}
        </div>
      </form>
    </div>
    </>
  );
}
