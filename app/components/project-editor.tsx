"use client";
import { useLayoutEffect, useState, type RefObject } from "react";
import dynamic from "next/dynamic";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  MapPin,
  Plus,
  Pentagon,
  Route,
  X,
} from "lucide-react";
import {
  categories,
  type Category,
  centroid,
  type Point,
  presetPlaces,
  type Project,
  type Status,
  statuses,
  statusOrder,
  unknownDeveloper,
} from "../lib/data";
import { errorMessage } from "../lib/api-client";
import { cn } from "../lib/cn";
import { controlBase, fieldControl } from "../lib/ui";
import ImagePicker from "./image-picker";

const ProjectMap = dynamic(() => import("./project-map"), { ssr: false });

const labelStyles = "block text-xs leading-normal font-semibold text-ink";
const fieldStyles = cn(
  fieldControl,
  "mt-1.75 rounded-lg px-3 py-2.5 text-ui leading-normal font-normal",
  "focus:ring-0 focus-visible:border-accent/55 focus-visible:ring-3 focus-visible:ring-accent/12",
  "max-sm:text-base",
);
const textareaStyles = cn(fieldStyles, "min-h-[110px] resize-y");
const primaryActionStyles = cn(
  controlBase,
  "rounded-lg border border-accent bg-accent text-xs text-white shadow-xs",
  "hover:border-accent-strong hover:bg-accent-strong",
);
const secondaryActionStyles = cn(
  controlBase,
  "rounded-lg border border-border-strong bg-transparent text-xs text-ink",
  "hover:bg-surface-muted",
);
const dangerActionStyles = cn(
  controlBase,
  "rounded-lg border border-danger bg-danger text-xs text-white shadow-xs",
  "hover:border-danger-strong hover:bg-danger-strong",
);
const textActionStyles = cn(
  controlBase,
  "rounded-lg border border-transparent bg-transparent px-2 text-2xs text-accent",
  "hover:text-accent-strong hover:underline hover:underline-offset-4",
);
const removePointStyles = cn(
  "ml-auto inline-flex size-11 shrink-0 items-center justify-center rounded-lg border border-transparent bg-transparent text-muted",
  "transition-[color,background-color,transform] duration-150",
  "hover:bg-danger-soft hover:text-danger",
  "active:scale-[0.97] motion-reduce:transition-none motion-reduce:active:scale-100",
);

/**
 * A new project, or a member's suggestion of one: a panel in the explorer.
 * Closing it with something written asks first; the panel's close button
 * goes through `closeRef`.
 */
export default function ProjectEditor({
  onClose,
  onSave,
  closeRef,
  suggest = false,
}: {
  onClose: () => void;
  onSave: (project: Project) => Promise<void>;
  closeRef: RefObject<(() => void) | null>;
  /** A member's suggestion, which waits for a moderator. */
  suggest?: boolean;
}) {
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [step, setStep] = useState(1);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [website, setWebsite] = useState("");
  const [city, setCity] = useState("Oslo");
  const [district, setDistrict] = useState("");
  const [status, setStatus] = useState<Status>("planned");
  const [category, setCategory] = useState<Category>(categories[0]);
  const [year, setYear] = useState("2028");
  const [developer, setDeveloper] = useState("");
  const [points, setPoints] = useState<Point[]>([]);
  const [geometryType, setGeometryType] = useState<"area" | "line">("area");
  const [coordinate, setCoordinate] = useState("");
  const [coordinateError, setCoordinateError] = useState("");
  const [cancelConfirm, setCancelConfirm] = useState(false);
  const [images, setImages] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const enoughPoints = points.length >= (geometryType === "area" ? 3 : 2);
  async function save() {
    if (saving || uploading) return;
    if (!enoughPoints || !title.trim() || !description.trim()) return;
    const id = `prosjekt-${crypto.randomUUID().slice(0, 8)}`;
    const created = new Date().toISOString();
    const [cover = "", ...more] = images;
    setSaving(true);
    setSaveError("");
    try {
      await onSave({
        id,
        title: title.trim(),
        description: description.trim(),
        website: website.trim() || undefined,
        city,
        district: district.trim() || city,
        category,
        status,
        year,
        developer: developer.trim() || unknownDeveloper,
        center: centroid(points),
        geometry: points,
        geometryType,
        image: cover,
        images: more.length
          ? more.map((src) => ({ src, alt: title.trim() }))
          : undefined,
        comments: 0,
        updated: created,
        updates: [],
      });
    } catch (error) {
      setSaveError(errorMessage(error, "Kunne ikke lagre prosjektet."));
    } finally {
      setSaving(false);
    }
  }
  function close() {
    if (title || description || points.length || images.length)
      setCancelConfirm(true);
    else onClose();
  }
  useLayoutEffect(() => {
    closeRef.current = close;
  });
  function addCoordinate() {
    const pair = coordinate.split(/[,;]/).map((n) => Number(n.trim()));
    if (
      pair.length !== 2 ||
      pair.some((n) => !Number.isFinite(n)) ||
      pair[0] < 57 ||
      pair[0] > 81 ||
      pair[1] < 3 ||
      pair[1] > 36
    ) {
      setCoordinateError(
        "Bruk breddegrad, lengdegrad i Norge, f.eks. 59.91, 10.75.",
      );
      return;
    }
    setPoints((current) => [...current, pair as Point]);
    setCoordinate("");
    setCoordinateError("");
  }
  return (
    <div
      className="@container min-h-0 flex-1 overflow-y-auto overscroll-contain scrollbar-thin"
      data-project-editor=""
      data-drawer-scroll
    >
      <div className="px-5 max-md:px-4.5">
        <div className="flex min-h-14 items-center max-md:min-h-12 max-md:pr-9">
          <h1 className="text-xl leading-normal font-[650] tracking-[-0.4px] max-md:text-lg">
            {suggest ? "Foreslå prosjekt" : "Nytt prosjekt"}
          </h1>
        </div>
        {saveError && (
          <p role="alert" className="pt-2 text-sm text-warning">
            {saveError}
          </p>
        )}
        <div
          className={cn(
            "flex items-center gap-3.75 border-b border-border pt-3 pb-4.5",
            "@max-xl:gap-2.5",
            step === 2 && "border-0",
          )}
          aria-label="Fremdrift"
          role="list"
        >
          <span
            className="group flex items-center gap-1.75 text-xs whitespace-nowrap text-muted aria-[current=step]:font-semibold aria-[current=step]:text-accent data-[state=complete]:text-muted @max-xl:gap-1.25 @max-xl:text-2xs"
            aria-current={step === 1 ? "step" : undefined}
            data-state={step === 2 ? "complete" : "pending"}
            role="listitem"
          >
            <i
              className="flex size-5.5 items-center justify-center rounded-full bg-surface-muted text-xs not-italic group-aria-[current=step]:bg-accent group-aria-[current=step]:text-white group-data-[state=complete]:bg-accent group-data-[state=complete]:text-white @max-xl:size-5 @max-xl:text-2xs"
              aria-hidden="true"
            >
              {step === 2 ? <Check size={13} /> : "1"}
            </i>
            Detaljer
          </span>
          <div className="h-px flex-1 bg-surface-muted" aria-hidden="true" />
          <span
            className="group flex items-center gap-1.75 text-xs whitespace-nowrap text-muted aria-[current=step]:font-semibold aria-[current=step]:text-accent @max-xl:gap-1.25 @max-xl:text-2xs"
            aria-current={step === 2 ? "step" : undefined}
            role="listitem"
          >
            <i
              className="flex size-5.5 items-center justify-center rounded-full bg-surface-muted text-xs not-italic group-aria-[current=step]:bg-accent group-aria-[current=step]:text-white @max-xl:size-5 @max-xl:text-2xs"
              aria-hidden="true"
            >
              2
            </i>
            Kartområde
          </span>
        </div>
      </div>
      {cancelConfirm ? (
        <section
          className="flex flex-col items-start gap-4.75 px-5 py-6 max-md:px-4.5"
          aria-labelledby="cancel-project-title"
        >
          <h2
            id="cancel-project-title"
            className="text-[22px] leading-tight font-semibold tracking-[-0.9px] @max-xl:text-[25px]"
          >
            Forkaste prosjektet?
          </h2>
          <div className="mt-1.25 flex w-full items-center justify-end gap-3 border-t border-border pt-4.25">
            <button
              type="button"
              className={secondaryActionStyles}
              onClick={() => setCancelConfirm(false)}
            >
              Fortsett å redigere
            </button>
            <button
              type="button"
              className={dangerActionStyles}
              onClick={onClose}
            >
              Forkast
            </button>
          </div>
        </section>
      ) : step === 1 ? (
        <form
          className="flex flex-col gap-4.5 px-5 pt-5 pb-8 max-md:gap-4 max-md:px-4.5"
          onSubmit={(e) => {
            e.preventDefault();
            if (title.trim() && description.trim()) setStep(2);
          }}
        >
          <label className={labelStyles}>
            Prosjektnavn <span className="text-muted">*</span>
            <input
              className={fieldStyles}
              required
              maxLength={100}
              autoFocus
              placeholder="Prosjektnavn"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </label>
          <label className={labelStyles}>
            Beskrivelse <span className="text-muted">*</span>
            <textarea
              className={textareaStyles}
              required
              maxLength={5000}
              placeholder="Kort om prosjektet"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </label>
          <label className={labelStyles}>
            Prosjektlenke
            <input
              className={fieldStyles}
              type="url"
              pattern="https://.*"
              maxLength={2000}
              value={website}
              onChange={(event) => setWebsite(event.target.value)}
              placeholder="https://…"
            />
          </label>
          <div>
            <span className={labelStyles}>Bilder</span>
            <ImagePicker
              className="mt-1.75"
              value={images}
              onChange={setImages}
              onBusy={setUploading}
            />
          </div>
          <div className="grid grid-cols-2 gap-4.5 @max-xl:gap-3.25">
            <label className={labelStyles}>
              Sted
              <input
                className={fieldStyles}
                required
                list="norwegian-cities"
                value={city}
                maxLength={80}
                onChange={(e) => {
                  setCity(e.target.value);
                  setPoints([]);
                }}
              />
              <datalist id="norwegian-cities">
                {presetPlaces.map((place) => (
                  <option key={place} value={place} />
                ))}
              </datalist>
            </label>
            <label className={labelStyles}>
              Område / bydel
              <input
                className={fieldStyles}
                value={district}
                maxLength={80}
                onChange={(e) => setDistrict(e.target.value)}
                placeholder="F.eks. Bjørvika"
              />
            </label>
          </div>
          <div className="grid grid-cols-2 gap-4.5 @max-xl:gap-3.25">
            <label className={labelStyles}>
              Prosjekttype
              <select
                className={fieldStyles}
                value={category}
                onChange={(e) => setCategory(e.target.value as Category)}
              >
                {categories.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </label>
            <label className={labelStyles}>
              Status
              <select
                className={fieldStyles}
                value={status}
                onChange={(e) => setStatus(e.target.value as Status)}
              >
                {statusOrder.map((s) => (
                  <option value={s} key={s}>
                    {statuses[s].label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="grid grid-cols-2 gap-4.5 @max-xl:gap-3.25">
            <label className={labelStyles}>
              Forventet ferdig
              <input
                className={fieldStyles}
                type="number"
                min="2000"
                max="2100"
                required
                value={year}
                onChange={(e) => setYear(e.target.value)}
              />
            </label>
            <label className={labelStyles}>
              Byggherre
              <input
                className={fieldStyles}
                placeholder="Valgfritt"
                value={developer}
                maxLength={100}
                onChange={(e) => setDeveloper(e.target.value)}
              />
            </label>
          </div>
          <div className="mt-1.25 flex items-center justify-between gap-3.75 border-t border-border pt-4.75 @max-xl:gap-3">
            <span className="text-xs text-muted @max-xl:text-[8px]">
              {suggest ? "Til moderering" : "Publiseres for alle"}
            </span>
            <button
              className={cn(
                primaryActionStyles,
                "@max-xl:px-3 @max-xl:text-xs",
              )}
              type="submit"
            >
              Tegn området
              <ArrowRight size={16} />
            </button>
          </div>
        </form>
      ) : (
        <>
          <div className="grid min-h-100 grid-cols-[270px_minmax(0,1fr)] border-y border-border @max-3xl:grid-cols-[225px_minmax(0,1fr)] @max-xl:flex @max-xl:flex-col">
            <aside className="border-r border-border p-6 @max-3xl:p-5.25 @max-xl:border-r-0 @max-xl:border-b @max-xl:px-5.5 @max-xl:py-4.75">
              <h2 className="my-2 text-[19px] leading-[1.3] font-semibold tracking-[-0.5px] @max-xl:my-1.5">
                {title}
              </h2>
              <span className="flex items-center gap-1 text-xs leading-normal text-muted">
                <MapPin size={13} />
                {district || city}, {city}
              </span>
              <div className="mt-7 text-muted @max-xl:hidden">
                {geometryType === "area" ? (
                  <Pentagon size={23} />
                ) : (
                  <Route size={23} />
                )}
                <h3 className="mt-3 mb-2.25 text-ui font-semibold text-ink">
                  {geometryType === "area" ? "Tegn et område" : "Tegn en trasé"}
                </h3>
                <p className="mb-2.5 text-2xs leading-[1.8] text-muted">
                  {geometryType === "area"
                    ? "Sett minst tre punkter rundt området."
                    : "Sett minst to punkter langs traseen."}
                </p>
              </div>
              <div
                className="mt-4 flex items-center gap-1.5 border-t border-border py-2.5 text-xs text-muted data-[valid=true]:text-accent @max-xl:mt-2.5 @max-xl:pt-2.5 @max-xl:pb-0 @max-xl:text-2xs"
                data-valid={enoughPoints}
                role="status"
                aria-live="polite"
              >
                {enoughPoints ? <Check size={16} /> : <Plus size={16} />}
                {points.length} punkter
                {enoughPoints
                  ? " · Klar"
                  : ` · Minst ${geometryType === "area" ? 3 : 2} kreves`}
              </div>
              {points.length > 0 && (
                <ol
                  className="mt-4 max-h-37.5 list-none overflow-y-auto p-0 scrollbar-thin"
                  aria-label="Kartpunkter"
                >
                  {points.map((point, index) => (
                    <li
                      className="flex min-h-11 items-center gap-2 border-b border-border py-0.75 text-2xs"
                      key={index}
                    >
                      <span className="grid size-4.75 shrink-0 place-items-center rounded-full bg-accent-soft text-2xs text-ink">
                        {index + 1}
                      </span>
                      <code className="min-w-0 flex-1 text-xs text-muted">
                        {point[0].toFixed(4)}, {point[1].toFixed(4)}
                      </code>
                      <button
                        type="button"
                        className={removePointStyles}
                        aria-label={`Fjern punkt ${index + 1}`}
                        onClick={() =>
                          setPoints((current) =>
                            current.filter((_, i) => i !== index),
                          )
                        }
                      >
                        <X size={14} />
                      </button>
                    </li>
                  ))}
                </ol>
              )}
              <details className="group mt-2.75 text-xs text-muted open:text-accent @max-xl:mt-2.5">
                <summary
                  className={cn(
                    "flex min-h-11 cursor-pointer items-center rounded-lg text-current",
                  )}
                >
                  Legg inn koordinater
                </summary>
                <label className={cn(labelStyles, "mt-3 text-xs")}>
                  Breddegrad, lengdegrad
                  <input
                    id="project-coordinate"
                    className={cn(
                      fieldStyles,
                      "text-ui max-sm:text-base",
                    )}
                    inputMode="decimal"
                    value={coordinate}
                    onChange={(e) => setCoordinate(e.target.value)}
                    placeholder="59.91, 10.75"
                    aria-invalid={coordinateError ? "true" : undefined}
                    aria-describedby={
                      coordinateError ? "project-coordinate-error" : undefined
                    }
                  />
                </label>
                <button
                  type="button"
                  className={cn(secondaryActionStyles, "mt-2 px-2 text-xs")}
                  onClick={addCoordinate}
                >
                  Legg til punkt
                  <Plus size={14} />
                </button>
                {coordinateError && (
                  <p
                    id="project-coordinate-error"
                    className="mt-1.75 text-xs text-danger"
                    role="alert"
                  >
                    {coordinateError}
                  </p>
                )}
              </details>
            </aside>
            <div className="min-h-105 min-w-0 @max-xl:h-87.5 @max-xl:min-h-87.5">
              <ProjectMap
                city={city}
                draw
                points={points}
                geometryType={geometryType}
                onGeometryChange={setGeometryType}
                onPointsChange={setPoints}
              />
            </div>
          </div>
          <div className="flex items-center justify-between gap-3.75 px-7 py-5.5 @max-xl:px-5 @max-xl:py-4.25">
            <button
              type="button"
              className={cn(textActionStyles, "@max-xl:text-xs")}
              onClick={() => setStep(1)}
            >
              <ArrowLeft size={16} />
              Tilbake
            </button>
            <span className="text-xs text-muted @max-3xl:hidden">
              {points.length} punkter
            </span>
            <button
              type="button"
              className={cn(
                primaryActionStyles,
                "@max-xl:px-3 @max-xl:text-xs",
              )}
              disabled={saving || uploading || !enoughPoints}
              onClick={() => void save()}
            >
              {suggest ? "Send forslag" : "Legg til prosjekt"}
              <Check size={16} />
            </button>
          </div>
        </>
      )}
    </div>
  );
}
