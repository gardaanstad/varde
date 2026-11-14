"use client";
import {
  createContext,
  use,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import dynamic from "next/dynamic";
import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  ArrowUpRight,
  Check,
  ChevronDown,
  CircleSlash,
  LoaderCircle,
  Ellipsis,
  Inbox,
  Lightbulb,
  MessageSquareText,
  Pencil,
  Plus,
  RotateCcw,
  TriangleAlert,
  X,
} from "lucide-react";
import { apiRequest, errorMessage } from "../lib/api-client";
import { cn } from "../lib/cn";
import {
  diffParagraphs,
  diffWords,
  formatDistance,
  geometryChange,
  overlayPaths,
  type DiffPart,
} from "../lib/diff";
import {
  categoryLabels,
  ownPhotos,
  projectHref,
  projectPhotos,
  type Project,
} from "../lib/data";
import {
  applyChanges,
  type CorrectionChanges,
  type CorrectionKey,
  kindLabels,
  statusLabels,
  type Suggestion,
  type SuggestionKind,
  type SuggestionLists,
  type SuggestionMutation,
  type SuggestionStatus,
  tipTitle,
} from "../lib/suggestions";
import {
  dangerButton,
  fieldControl,
  secondaryButton,
  textButton,
} from "../lib/ui";
import { Menu } from "@base-ui/react/menu";
import { PanelHeader } from "./panel";
import BackLink from "./back-link";
import ProfileAvatar from "./profile-avatar";
import { fields, type FieldId } from "./project-edit";
import RelativeTime from "./relative-time";
import { notify } from "./toast";

const ProjectMap = dynamic(() => import("./project-map"), { ssr: false });
const openLink =
  "inline-flex min-h-8 items-center gap-1 text-ui font-medium text-accent hover:underline hover:underline-offset-4";
// Loading marks reviews as seen, so a remount mid-load (as in development's
// strict mode) shares the one request rather than finding nothing new.
let loading: Promise<SuggestionLists> | null = null;
function loadSuggestions() {
  loading ??= apiRequest<SuggestionLists>("/api/suggestions?seen").finally(
    () => {
      loading = null;
    },
  );
  return loading;
}
/** In the explorer's sidebar, projects open in place instead of by link. */
const OpenProject = createContext<((projectId: string) => void) | null>(null);

type Tab = "queue" | "handled" | "mine";
type Review = (mutation: SuggestionMutation) => Promise<void>;
/** Edit-then-approve values a moderator can change before approving. */
type Overrides = { title?: string; description?: string; text?: string };

const fieldOrder = Object.keys(fields) as FieldId[];
const input = cn(
  fieldControl,
  "min-h-10 rounded-lg px-2.5 text-ui max-sm:text-base",
);
const fieldLabel = "block text-xs font-medium text-muted";
/** Removed and added text, styled like a code review. */
const removed =
  "rounded-[3px] bg-diff-remove px-px text-diff-remove-ink line-through decoration-diff-remove-ink/45 box-decoration-clone";
const added =
  "rounded-[3px] bg-diff-add px-px text-diff-add-ink no-underline box-decoration-clone";
const chip = "inline-flex min-h-6 items-center rounded-md px-1.75 text-ui";

const kindIcons: Record<SuggestionKind, typeof Plus> = {
  project: Plus,
  correction: Pencil,
  update: Lightbulb,
};
/** The row's leading icon; the kind's name is read out, not shown. */
function KindIcon({ kind }: { kind: SuggestionKind }) {
  const Icon = kindIcons[kind];
  return (
    <span
      className="grid size-8 shrink-0 place-items-center rounded-full bg-surface-muted text-ink-soft"
      data-kind={kind}
      data-tooltip={kindLabels[kind]}
    >
      <Icon size={15} strokeWidth={2.1} aria-hidden="true" />
      <span className="sr-only">{kindLabels[kind]}</span>
    </span>
  );
}

/** "1 endring", "3 endringer". */
export function changeCount(count: number) {
  return `${count} ${count === 1 ? "endring" : "endringer"}`;
}

const statusChip: Record<SuggestionStatus, string> = {
  pending: "text-status-construction-ink [&>i]:bg-status-construction",
  approved: "text-status-completed-ink [&>i]:bg-status-completed",
  rejected: "text-danger [&>i]:bg-danger",
};
function StatusBadge({ status }: { status: SuggestionStatus }) {
  return (
    <span
      className={cn(
        "inline-flex h-6 shrink-0 items-center gap-1.5 text-xs font-semibold",
        statusChip[status],
      )}
    >
      <i className="size-1.75 rounded-full" aria-hidden="true" />
      {statusLabels[status]}
    </span>
  );
}

/** Text with its changes marked inline. */
function Parts({ parts }: { parts: DiffPart[] }) {
  return parts.map((part, index) =>
    part.type === "same" ? (
      <span key={index}>{part.text}</span>
    ) : part.type === "remove" ? (
      <del key={index} className={removed}>
        {part.text}
      </del>
    ) : (
      <ins key={index} className={added}>
        {part.text}
      </ins>
    ),
  );
}

type DiffLine = { marker: "+" | "−" | ""; parts: DiffPart[] };

/**
 * A unified text diff, every paragraph shown. Changed paragraphs get a + or
 * − in the gutter; an edited one shows its old and new form, each with its
 * own words marked. Unchanged ones keep the same indent.
 */
function TextDiff({ before, after }: { before: string; after: string }) {
  const lines = useMemo(() => {
    const out: DiffLine[] = [];
    for (const paragraph of diffParagraphs(before, after)) {
      if (paragraph.type === "same") {
        out.push({ marker: "", parts: [{ type: "same", text: paragraph.text }] });
        continue;
      }
      const kinds = new Set(paragraph.parts.map((part) => part.type));
      if (kinds.has("remove"))
        out.push({
          marker: "−",
          parts: paragraph.parts.filter((part) => part.type !== "add"),
        });
      if (kinds.has("add"))
        out.push({
          marker: "+",
          parts: paragraph.parts.filter((part) => part.type !== "remove"),
        });
    }
    return out;
  }, [before, after]);
  return (
    <div className="space-y-1.5" data-text-diff="">
      {lines.map((line, index) => (
        <div
          key={index}
          className="grid grid-cols-[14px_minmax(0,1fr)] gap-x-1.5"
          data-marker={line.marker || undefined}
        >
          <span
            className={cn(
              "text-center font-mono text-ui leading-[1.65] font-semibold select-none",
              line.marker === "+" ? "text-diff-add-ink" : "text-diff-remove-ink",
            )}
            aria-hidden="true"
          >
            {line.marker}
          </span>
          <p
            className={cn(
              "text-ui leading-[1.65] whitespace-pre-wrap wrap-anywhere",
              line.marker ? "text-ink" : "text-ink-soft",
            )}
          >
            {line.marker && (
              <span className="sr-only">
                {line.marker === "+" ? "Lagt til: " : "Fjernet: "}
              </span>
            )}
            <Parts parts={line.parts} />
          </p>
        </div>
      ))}
    </div>
  );
}

/** An old and a new drawing overlaid at one scale, with what changed. */
function GeometryDiff({ before, after }: { before: Project; after: Project }) {
  const change = geometryChange(before, after);
  const [oldPath, newPath] = overlayPaths([before, after], 320, 168);
  const kind = (type: "area" | "line") => (type === "area" ? "Område" : "Trasé");
  return (
    <div className="space-y-2">
      <svg
        viewBox="0 0 320 168"
        className="h-42 w-full max-w-110 rounded-lg border border-border bg-surface-subtle"
        role="img"
        aria-label="Kartendring"
      >
        <path
          d={oldPath}
          className={cn(
            "stroke-diff-remove-ink/80 [stroke-dasharray:5_4]",
            before.geometryType === "area" ? "fill-diff-remove/70" : "fill-none",
          )}
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        <path
          d={newPath}
          className={cn(
            "stroke-diff-add-ink",
            after.geometryType === "area" ? "fill-diff-add/70" : "fill-none",
          )}
          strokeWidth={2.5}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      </svg>
      <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
        <span className="inline-flex items-center gap-1.5">
          <i className="h-0.5 w-3.5 border-t-2 border-dashed border-diff-remove-ink/80" />
          Før
        </span>
        <span className="inline-flex items-center gap-1.5">
          <i className="h-0.5 w-3.5 rounded bg-diff-add-ink" />
          Etter
        </span>
        <span className="tabular-nums text-ink-soft">
          {change.type[0] === change.type[1]
            ? kind(change.type[0])
            : `${kind(change.type[0])} → ${kind(change.type[1])}`}
          {" · "}
          {change.points[0]} → {change.points[1]} punkter
          {change.moved >= 10 && ` · flyttet ${formatDistance(change.moved)}`}
        </span>
      </p>
    </div>
  );
}

function ValueChange({ before, after }: { before: string; after: string }) {
  return (
    <span className="flex min-w-0 flex-wrap items-center gap-1.5 wrap-anywhere">
      {before !== "–" && (
        <>
          <del className={cn(chip, removed, "px-1.75")}>{before}</del>
          <ArrowRight
            size={13}
            className="shrink-0 text-muted"
            aria-label="til"
          />
        </>
      )}
      <ins className={cn(chip, added, "px-1.75")}>{after}</ins>
    </span>
  );
}

/** Pending photos are private, so they bypass the image optimizer. */
function Photos({ srcs }: { srcs: string[] }) {
  if (!srcs.length) return null;
  return (
    <ul className="grid list-none grid-cols-4 gap-2 p-0 max-sm:grid-cols-3">
      {srcs.map((src, index) => (
        <li
          key={src}
          className="relative aspect-4/3 overflow-hidden rounded-lg bg-surface-muted"
        >
          <Image
            src={src}
            alt={`Bilde ${index + 1}`}
            fill
            sizes="180px"
            unoptimized
            className="object-cover"
          />
        </li>
      ))}
    </ul>
  );
}

/** The photos after a correction, cover first; new and removed ones marked. */
function PhotoDiff({ before, after }: { before: Project; after: Project }) {
  const was = ownPhotos(before).map((photo) => photo.src);
  const now = ownPhotos(after).map((photo) => photo.src);
  const tiles = [
    ...now.map((src) => ({ src, state: was.includes(src) ? "kept" : "added" })),
    ...was
      .filter((src) => !now.includes(src))
      .map((src) => ({ src, state: "removed" })),
  ];
  const marks: Record<string, string | undefined> = {
    added: "Ny",
    removed: "Fjernet",
  };
  const badge = (index: number, state: string) =>
    [index === 0 && state !== "removed" && "Forside", marks[state]]
      .filter(Boolean)
      .join(" · ");
  return (
    <ul className="grid list-none grid-cols-4 gap-2 p-0 max-sm:grid-cols-3">
      {tiles.map(({ src, state }, index) => (
        <li
          key={src}
          className={cn(
            "relative aspect-4/3 overflow-hidden rounded-lg bg-surface-muted",
            state === "added" && "ring-2 ring-diff-add-ink",
            state === "removed" && "opacity-50 ring-2 ring-diff-remove-ink",
          )}
          data-photo={state}
        >
          <Image
            src={src}
            alt={`Bilde ${index + 1}`}
            fill
            sizes="180px"
            unoptimized
            className="object-cover"
          />
          {badge(index, state) && (
            <span className="absolute bottom-1 left-1 rounded-full bg-scrim/60 px-1.5 text-2xs font-semibold text-white">
              {badge(index, state)}
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}

const changedIds = (changes: CorrectionChanges) =>
  fieldOrder.filter((id) =>
    fields[id].keys.some((key) => key !== "center" && key in changes),
  );

/** The second line, before the date: what the suggestion is about. */
function summary(suggestion: Suggestion): string {
  if (suggestion.kind === "update")
    return tipTitle(suggestion.data.text) || suggestion.data.text;
  if (suggestion.kind === "project") return categoryLabels(suggestion.data.project.categories).join(", ");
  const ids = changedIds(suggestion.data.changes);
  const applied = suggestion.data.applied;
  const appliedIds = applied
    ? ids.filter((id) =>
        fields[id].keys.some((key) => applied.includes(key as CorrectionKey)),
      )
    : undefined;
  return appliedIds && appliedIds.length !== ids.length
    ? `${appliedIds.length} av ${changeCount(ids.length)}`
    : changeCount(ids.length);
}

/** Per field: leave this change out of the approval, or take it back in. */
function FieldMenu({
  label,
  excluded,
  onExclude,
}: {
  label: string;
  excluded: boolean;
  onExclude: (excluded: boolean) => void;
}) {
  if (excluded)
    return (
      <button
        type="button"
        className={cn(textButton, "-my-1 -mr-2 min-h-7 px-2 text-xs")}
        onClick={() => onExclude(false)}
      >
        <RotateCcw size={12} aria-hidden="true" />
        Ta med igjen
      </button>
    );
  return (
    <Menu.Root>
      <Menu.Trigger
        className={cn(
          "-my-1 -mr-1.5 grid size-7 place-items-center rounded-md text-muted",
          "opacity-0 transition-opacity duration-120 group-hover/field:opacity-100 focus-visible:opacity-100",
          "hover:bg-ink/[0.06] hover:text-ink data-popup-open:bg-ink/[0.06] data-popup-open:opacity-100",
          "pointer-coarse:opacity-100 motion-reduce:transition-none",
        )}
        aria-label={`Valg for ${label.toLowerCase()}`}
      >
        <Ellipsis size={16} aria-hidden="true" />
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner side="bottom" align="end" sideOffset={4} className="z-50">
          <Menu.Popup className="min-w-52 rounded-xl border border-border bg-surface p-1.5 text-ui shadow-popover outline-none motion-safe:animate-menu-enter">
            <Menu.Item
              className="flex min-h-9 cursor-default items-center gap-2 rounded-lg px-2.5 py-1.5 text-ink outline-none select-none pointer-fine:data-highlighted:bg-surface-muted focus-visible:bg-surface-muted"
              onClick={() => onExclude(true)}
            >
              <CircleSlash size={14} className="text-muted" aria-hidden="true" />
              Ikke ta med denne endringen
            </Menu.Item>
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}

function CorrectionBody({
  suggestion,
  queue,
  excluded,
  onExclude,
}: {
  suggestion: Extract<Suggestion, { kind: "correction" }>;
  queue: boolean;
  excluded: FieldId[];
  onExclude: (field: FieldId, excluded: boolean) => void;
}) {
  const { project, data } = suggestion;
  if (!project) return null;
  // The queue compares with the project as it is now; elsewhere, with how it
  // was when the suggestion was sent.
  const before = queue ? project : { ...project, ...data.base };
  const after = applyChanges(before, data.changes);
  const stale = (field: FieldId) =>
    queue &&
    fields[field].keys.some(
      (key) =>
        key in data.base &&
        JSON.stringify(data.base[key as CorrectionKey] ?? "") !==
          JSON.stringify(project[key] ?? ""),
    );
  return (
    <ul className="divide-y divide-border" aria-label="Endringer">
      {changedIds(data.changes).map((field) => {
        const value = (p: Project) => fields[field].show(p);
        const out = excluded.includes(field);
        return (
          <li
            key={field}
            className="group/field py-3 first:pt-1"
            data-field={field}
            data-excluded={out || undefined}
          >
            <div className="mb-1.5 flex min-h-6 items-center gap-2">
              <h3
                className={cn(
                  "text-xs font-semibold text-ink",
                  out && "text-muted line-through decoration-muted/60",
                )}
              >
                {fields[field].label}
              </h3>
              {out && (
                <span className="text-2xs font-medium text-muted">Ikke med</span>
              )}
              {stale(field) && (
                <span
                  className="inline-flex items-center gap-1 text-2xs font-semibold text-warning"
                  data-tooltip="Endret etter at forslaget ble sendt"
                >
                  <TriangleAlert size={12} aria-hidden="true" />
                  Endret siden
                </span>
              )}
              {queue && (
                <span className="ml-auto">
                  <FieldMenu
                    label={fields[field].label}
                    excluded={out}
                    onExclude={(next) => onExclude(field, next)}
                  />
                </span>
              )}
            </div>
            <div
              className={cn(
                "min-w-0 transition-opacity duration-150 motion-reduce:transition-none",
                out && "opacity-40 grayscale",
              )}
            >
              {field === "description" ? (
                <TextDiff before={before.description} after={after.description} />
              ) : field === "title" ? (
                <p className="text-ui leading-relaxed wrap-anywhere">
                  <Parts parts={diffWords(before.title, after.title)} />
                </p>
              ) : field === "geometry" ? (
                <GeometryDiff before={before} after={after} />
              ) : field === "images" ? (
                <PhotoDiff before={before} after={after} />
              ) : (
                <ValueChange before={value(before)} after={value(after)} />
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function PreviewMap({ project }: { project: Project }) {
  return (
    <div className="h-52 overflow-hidden rounded-lg border border-border max-sm:h-44">
      <ProjectMap projects={[project]} city={project.city} compact frame />
    </div>
  );
}

function ProjectBody({
  project,
  editing,
  overrides,
  onChange,
}: {
  project: Project;
  editing: boolean;
  overrides: Overrides;
  onChange: (overrides: Overrides) => void;
}) {
  const facts: FieldId[] = [
    "status",
    "place",
    "year",
    "developer",
    "website",
    "geometry",
  ];
  return (
    <div className="space-y-4">
      {editing ? (
        <>
          <label className={fieldLabel}>
            Prosjektnavn
            <input
              className={cn(input, "mt-1")}
              maxLength={160}
              value={overrides.title ?? project.title}
              onChange={(event) =>
                onChange({ ...overrides, title: event.target.value })
              }
            />
          </label>
          <label className={fieldLabel}>
            Beskrivelse
            <textarea
              className={cn(input, "mt-1 min-h-28 resize-y py-2")}
              maxLength={10_000}
              value={overrides.description ?? project.description}
              onChange={(event) =>
                onChange({ ...overrides, description: event.target.value })
              }
            />
          </label>
        </>
      ) : (
        <p className="text-ui leading-[1.65] whitespace-pre-wrap wrap-anywhere text-ink-soft">
          {project.description}
        </p>
      )}
      <PreviewMap project={project} />
      <dl className="grid grid-cols-[104px_minmax(0,1fr)] text-ui leading-normal max-sm:grid-cols-[88px_minmax(0,1fr)]">
        {facts.map((id) => (
          <div key={id} className="contents">
            <dt className="border-t border-border py-1.5 text-muted">
              {fields[id].label}
            </dt>
            <dd className="border-t border-border py-1.5 pl-3 font-medium wrap-anywhere">
              {fields[id].show(project)}
            </dd>
          </div>
        ))}
      </dl>
      <Photos srcs={projectPhotos(project).map((photo) => photo.src)} />
    </div>
  );
}

function TipBody({
  suggestion,
  queue,
  editing,
  overrides,
  onChange,
}: {
  suggestion: Extract<Suggestion, { kind: "update" }>;
  queue: boolean;
  editing: boolean;
  overrides: Overrides;
  onChange: (overrides: Overrides) => void;
}) {
  const { data } = suggestion;
  let host = data.sourceUrl;
  try {
    host = new URL(data.sourceUrl).hostname.replace(/^www\./, "");
  } catch {}
  return (
    <div className="space-y-3">
      {queue && (
        <label className={fieldLabel}>
          Overskrift
          <input
            className={cn(input, "mt-1 font-semibold")}
            maxLength={200}
            value={overrides.title ?? tipTitle(data.text)}
            onChange={(event) =>
              onChange({ ...overrides, title: event.target.value })
            }
          />
        </label>
      )}
      {editing ? (
        <label className={fieldLabel}>
          Tekst
          <textarea
            className={cn(input, "mt-1 min-h-28 resize-y py-2")}
            maxLength={10_000}
            value={overrides.text ?? data.text}
            onChange={(event) =>
              onChange({ ...overrides, text: event.target.value })
            }
          />
        </label>
      ) : (
        <p className="text-ui leading-[1.65] whitespace-pre-wrap wrap-anywhere text-ink-soft">
          {data.text}
        </p>
      )}
      <a
        href={data.sourceUrl}
        target="_blank"
        rel="noreferrer"
        className="inline-flex min-h-7 items-center gap-1 text-ui font-medium text-accent hover:underline hover:underline-offset-4"
      >
        {host}
        <ArrowUpRight size={14} aria-hidden="true" />
      </a>
      {data.image && <Photos srcs={[data.image]} />}
    </div>
  );
}

/** The suggester's own note, quoted quietly. */
function Note({ author, note }: { author: string; note: string }) {
  return (
    <figure className="flex gap-2.5 rounded-lg border-l-2 border-border-strong bg-surface-subtle py-2 pr-3 pl-2.5">
      <ProfileAvatar name={author} className="mt-0.5 size-5.5 text-2xs" />
      <div className="min-w-0">
        <figcaption
          className="flex w-fit items-center gap-1 rounded text-xs font-medium text-muted"
          tabIndex={0}
          data-tooltip={`Merknad fra @${author}`}
          aria-label={`Merknad fra @${author}`}
        >
          <MessageSquareText size={12} aria-hidden="true" />@{author}
        </figcaption>
        <blockquote className="mt-0.5 text-ui leading-relaxed whitespace-pre-wrap wrap-anywhere text-ink-soft">
          {note}
        </blockquote>
      </div>
    </figure>
  );
}

const iconAction = cn(
  "grid size-9 shrink-0 place-items-center rounded-full border",
  "transition-[color,background-color,border-color,transform] duration-150",
  "active:scale-[0.96] disabled:pointer-events-none disabled:opacity-40",
  "motion-reduce:transition-none motion-reduce:active:scale-100",
);

function SuggestionRow({
  suggestion,
  tab,
  expanded,
  onToggle,
  onReview,
}: {
  suggestion: Suggestion;
  tab: Tab;
  expanded: boolean;
  onToggle: () => void;
  onReview: Review;
}) {
  const bodyId = useId();
  const openProject = use(OpenProject);
  const queue = tab === "queue";
  // The body mounts on first open and stays, so closing can animate.
  const [mounted, setMounted] = useState(expanded);
  if (expanded && !mounted) setMounted(true);
  const [editing, setEditing] = useState(false);
  const [overrides, setOverrides] = useState<Overrides>({});
  const [excluded, setExcluded] = useState<FieldId[]>([]);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const reasonRef = useRef<HTMLInputElement>(null);
  const linked =
    suggestion.projectId &&
    (suggestion.kind !== "project" || suggestion.status === "approved");
  const included =
    suggestion.kind === "correction"
      ? changedIds(suggestion.data.changes).filter(
          (id) => !excluded.includes(id),
        )
      : [];

  useEffect(() => {
    if (rejecting) reasonRef.current?.focus();
  }, [rejecting]);

  async function run(mutation: SuggestionMutation) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await onReview(mutation);
    } catch (failure) {
      setError(errorMessage(failure, "Kunne ikke behandle forslaget."));
      setBusy(false);
    }
  }
  function approve() {
    const edited = Object.fromEntries(
      Object.entries(overrides).filter(([, value]) => value?.trim()),
    );
    void run({
      action: "approve",
      id: suggestion.id,
      ...edited,
      ...(suggestion.kind === "update" && {
        title: overrides.title?.trim() || tipTitle(suggestion.data.text),
      }),
      ...(suggestion.kind === "correction" && {
        keys: included.flatMap((id) => fields[id].keys) as CorrectionKey[],
      }),
    });
  }
  const reject = () =>
    void run({ action: "reject", id: suggestion.id, reason });

  return (
    <article
      className={cn(
        "transition-colors duration-150 motion-reduce:transition-none",
        !expanded && "hover:bg-surface-subtle",
      )}
      aria-labelledby={`${bodyId}-title`}
      data-suggestion={suggestion.kind}
      data-expanded={expanded || undefined}
    >
      <button
        type="button"
        className="flex w-full items-center gap-3 px-4 py-3 text-left outline-offset-[-2px] max-sm:px-3.5"
        aria-expanded={expanded}
        aria-controls={bodyId}
        onClick={onToggle}
        data-row-toggle=""
      >
        <KindIcon kind={suggestion.kind} />
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="flex min-w-0 items-center gap-2">
            {suggestion.fresh && tab === "mine" && (
              <span className="size-2 shrink-0 rounded-full bg-accent">
                <span className="sr-only">Ny</span>
              </span>
            )}
            <span
              id={`${bodyId}-title`}
              className="min-w-0 truncate text-sm font-semibold text-ink"
            >
              {suggestion.title}
            </span>
          </span>
          <span className="flex min-w-0 items-center gap-1.5 text-xs text-muted">
            <span className="min-w-0 truncate" data-summary="">
              {summary(suggestion)}
            </span>
            <span aria-hidden="true">·</span>
            <RelativeTime date={suggestion.createdAt} className="shrink-0" />
          </span>
          {suggestion.status === "rejected" && suggestion.reason && (
            <span className="truncate text-xs text-danger">
              {suggestion.reason}
            </span>
          )}
        </span>
        {!queue && <StatusBadge status={suggestion.status} />}
        <ChevronDown
          size={16}
          aria-hidden="true"
          className={cn(
            "shrink-0 text-muted transition-transform duration-280 ease-out-soft motion-reduce:transition-none",
            expanded && "rotate-180",
          )}
        />
      </button>
      {/* Height animates through the grid track, so nothing is measured. */}
      <div
        id={bodyId}
        className={cn(
          "grid transition-[grid-template-rows,opacity,visibility] duration-280 ease-out-soft motion-reduce:transition-none",
          expanded
            ? "visible grid-rows-[1fr] opacity-100"
            : "invisible grid-rows-[0fr] opacity-0",
        )}
        inert={!expanded}
        data-row-body=""
      >
        <div className="min-h-0 overflow-hidden">
          {mounted && (
            <div className="space-y-4 px-4 pb-4 pl-15 max-sm:px-3.5">
              {suggestion.kind === "project" && (
                <ProjectBody
                  project={suggestion.data.project}
                  editing={queue && editing}
                  overrides={overrides}
                  onChange={setOverrides}
                />
              )}
              {suggestion.kind === "correction" && (
                <CorrectionBody
                  suggestion={suggestion}
                  queue={queue}
                  excluded={excluded}
                  onExclude={(field, out) =>
                    setExcluded((current) =>
                      out
                        ? [...current, field]
                        : current.filter((item) => item !== field),
                    )
                  }
                />
              )}
              {suggestion.kind === "update" && (
                <TipBody
                  suggestion={suggestion}
                  queue={queue}
                  editing={queue && editing}
                  overrides={overrides}
                  onChange={setOverrides}
                />
              )}
              {suggestion.note && (
                <Note author={suggestion.author} note={suggestion.note} />
              )}
              {error && (
                <p role="alert" className="text-ui text-danger">
                  {error}
                </p>
              )}
              {queue && rejecting && (
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    ref={reasonRef}
                    className={cn(input, "min-w-0 flex-1 basis-60")}
                    aria-label="Begrunnelse"
                    placeholder="Begrunnelse (valgfritt)"
                    maxLength={300}
                    value={reason}
                    onChange={(event) => setReason(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") reject();
                      if (event.key === "Escape") setRejecting(false);
                    }}
                  />
                  <div className="ml-auto flex gap-2">
                    <button
                      type="button"
                      className={cn(secondaryButton, "min-h-9 rounded-lg px-3 text-ui")}
                      onClick={() => setRejecting(false)}
                    >
                      Avbryt
                    </button>
                    <button
                      type="button"
                      className={cn(dangerButton, "min-h-9 rounded-lg px-3 text-ui")}
                      disabled={busy}
                      onClick={reject}
                    >
                      Avvis forslag
                    </button>
                  </div>
                </div>
              )}
              <div className="flex min-h-9 items-center gap-3 border-t border-border pt-3">
                {tab !== "mine" && (
                  <span className="text-xs text-muted">@{suggestion.author}</span>
                )}
                {queue && suggestion.kind !== "correction" && (
                  <button
                    type="button"
                    className={cn(textButton, "min-h-8 px-1.5 text-ui")}
                    aria-pressed={editing}
                    onClick={() => setEditing(!editing)}
                  >
                    <Pencil size={13} aria-hidden="true" />
                    {editing ? "Ferdig" : "Rediger"}
                  </button>
                )}
                {linked &&
                  (openProject ? (
                    <button
                      type="button"
                      className={openLink}
                      data-press=""
                      onClick={() => openProject(suggestion.projectId!)}
                    >
                      Åpne prosjekt
                      <ArrowRight size={14} aria-hidden="true" />
                    </button>
                  ) : (
                    // A full load: the explorer opens projects from their URL.
                    <a href={projectHref(suggestion.projectId!)} className={openLink}>
                      Åpne prosjekt
                      <ArrowRight size={14} aria-hidden="true" />
                    </a>
                  ))}
                {queue && (
                  <div className="ml-auto flex items-center gap-2">
                    <button
                      type="button"
                      className={cn(
                        iconAction,
                        "border-danger/35 bg-surface text-danger hover:border-danger hover:bg-danger-soft",
                        rejecting && "border-danger bg-danger-soft",
                      )}
                      aria-label="Avvis"
                      aria-pressed={rejecting}
                      data-tooltip="Avvis"
                      disabled={busy}
                      onClick={() => setRejecting(!rejecting)}
                    >
                      <X size={17} strokeWidth={2.25} aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      className={cn(
                        iconAction,
                        "border-status-completed bg-status-completed text-on-accent hover:border-status-completed-ink hover:bg-status-completed-ink",
                      )}
                      aria-label="Godkjenn"
                      data-tooltip="Godkjenn"
                      disabled={
                        busy ||
                        (suggestion.kind === "correction" && !included.length)
                      }
                      onClick={approve}
                    >
                      <Check size={17} strokeWidth={2.5} aria-hidden="true" />
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </article>
  );
}

/** j / k (or arrow keys) move between rows; Enter opens one. */
function moveFocus(event: KeyboardEvent<HTMLElement>) {
  const target = event.target as HTMLElement;
  if (!target.matches("[data-row-toggle]")) return;
  const step =
    event.key === "j" || event.key === "ArrowDown"
      ? 1
      : event.key === "k" || event.key === "ArrowUp"
        ? -1
        : 0;
  if (!step) return;
  const toggles = Array.from(
    event.currentTarget.querySelectorAll<HTMLElement>("[data-row-toggle]"),
  );
  const next = toggles[toggles.indexOf(target) + step];
  if (!next) return;
  event.preventDefault();
  next.focus();
}

export default function SuggestionList({
  initial,
  moderator,
  embedded = false,
  onOpenProject,
  onClose,
  onChange,
}: {
  /** Without it, the list loads itself (and marks reviews as seen). */
  initial?: SuggestionLists;
  moderator: boolean;
  /** A panel in the explorer's sidebar rather than a page of its own. */
  embedded?: boolean;
  onOpenProject?: (projectId: string) => void;
  onClose?: () => void;
  /** After a review, which changes what the explorer shows. */
  onChange?: () => void;
}) {
  const [lists, setLists] = useState<SuggestionLists | null>(initial ?? null);
  const [loadError, setLoadError] = useState("");
  useEffect(() => {
    if (initial) return;
    let current = true;
    loadSuggestions()
      .then((next) => {
        if (!current) return;
        setLists(next);
        onChange?.();
      })
      .catch((error) => {
        if (current)
          setLoadError(errorMessage(error, "Kunne ikke hente forslagene."));
      });
    return () => {
      current = false;
    };
    // Loads once, when the panel opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [tab, setTab] = useState<Tab>(moderator ? "queue" : "mine");
  // One row open at a time.
  const [openId, setOpenId] = useState<string | null>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const queue = lists?.queue ?? [];
  const handled = lists?.handled ?? [];
  const mine = lists?.mine ?? [];
  const tabs: { id: Tab; label: string; count?: number }[] = moderator
    ? [
        { id: "queue", label: "Til behandling", count: queue.length },
        { id: "handled", label: "Behandlet" },
        ...(mine.length ? [{ id: "mine" as const, label: "Mine" }] : []),
      ]
    : [];
  const items =
    tab === "queue" ? queue : tab === "handled" ? handled : mine;

  async function review(mutation: SuggestionMutation) {
    const toggles = Array.from(
      listRef.current?.querySelectorAll<HTMLElement>("[data-row-toggle]") ?? [],
    );
    const index = toggles.findIndex((toggle) =>
      toggle.closest("article")?.contains(document.activeElement),
    );
    const next = await apiRequest<SuggestionLists>("/api/suggestions", {
      method: "POST",
      body: JSON.stringify(mutation),
    });
    setLists(next);
    onChange?.();
    notify(
      mutation.action === "approve"
        ? "Forslaget er godkjent"
        : "Forslaget er avvist",
    );
    // Keyboard reviews carry on with the next suggestion.
    requestAnimationFrame(() => {
      const rows =
        listRef.current?.querySelectorAll<HTMLElement>("[data-row-toggle]");
      if (rows?.length && index >= 0)
        rows[Math.min(index, rows.length - 1)].focus();
    });
  }

  const Root = embedded ? "div" : "main";
  const title = moderator ? "Forslag" : "Mine forslag";
  return (
    <OpenProject value={onOpenProject ?? null}>
    {embedded && <PanelHeader title={title} />}
    <Root
      className={
        embedded
          ? "min-h-0 flex-1 overflow-y-auto overscroll-contain px-4.5 pt-1 pb-8 scrollbar-thin md:px-gutter-scroll"
          : "min-h-dvh bg-canvas px-5 py-5 sm:px-10 sm:py-8 max-sm:px-3"
      }
      data-suggestion-list=""
      data-drawer-scroll={embedded || undefined}
    >
      <div className="mx-auto w-full max-w-200">
        {!embedded && (
          <>
            <BackLink href="/" />
            <h1 className="mt-3 mb-4 px-1 text-display">{title}</h1>
          </>
        )}
        {tabs.length > 0 && (
          <nav
            className={cn("mb-4 flex gap-6 border-b border-border", !embedded && "px-1")}
            aria-label="Forslag"
          >
            {tabs.map(({ id, label, count }) => (
              <button
                type="button"
                key={id}
                className={cn(
                  "-mb-px flex min-h-11 items-center gap-1.75 border-b-2 border-transparent",
                  "text-sm font-medium whitespace-nowrap text-muted",
                  "transition-colors duration-150 hover:text-ink motion-reduce:transition-none",
                  "aria-pressed:border-ink aria-pressed:text-ink",
                )}
                aria-pressed={tab === id}
                onClick={() => {
                  setTab(id);
                  setOpenId(null);
                }}
              >
                {label}
                {count !== undefined && (
                  <span className="rounded-full bg-surface-muted px-1.75 py-px text-xs font-semibold text-muted tabular-nums">
                    {count}
                  </span>
                )}
              </button>
            ))}
          </nav>
        )}
        <div className="overflow-hidden rounded-xl border border-border bg-surface shadow-xs">
          {!lists ? (
            <p
              role="status"
              className="flex min-h-40 items-center justify-center gap-2 text-sm text-muted"
            >
              {loadError || (
                <>
                  <LoaderCircle
                    size={18}
                    className="animate-spin motion-reduce:animate-none"
                    aria-hidden="true"
                  />
                  Henter forslag …
                </>
              )}
            </p>
          ) : items.length ? (
            <ul
              ref={listRef}
              className="list-none divide-y divide-border p-0"
              onKeyDown={moveFocus}
            >
              {items.map((suggestion) => (
                <li key={suggestion.id}>
                  <SuggestionRow
                    suggestion={suggestion}
                    tab={tab}
                    expanded={openId === suggestion.id}
                    onToggle={() =>
                      setOpenId(openId === suggestion.id ? null : suggestion.id)
                    }
                    onReview={review}
                  />
                </li>
              ))}
            </ul>
          ) : (
            <div className="flex flex-col items-center gap-3 px-4 py-14 text-center">
              <span className="grid size-12 place-items-center rounded-full bg-accent-soft text-accent">
                {tab === "queue" ? <Check size={22} /> : <Inbox size={22} />}
              </span>
              <h2 className="text-body font-semibold">
                {tab === "queue" ? "Ingen forslag venter" : "Ingen forslag"}
              </h2>
              {tab === "mine" &&
                !moderator &&
                (onClose ? (
                  <button
                    type="button"
                    onClick={onClose}
                    className={cn(secondaryButton, "min-h-9 rounded-lg px-3.5 text-ui")}
                  >
                    Til prosjektene
                  </button>
                ) : (
                  <Link
                    href="/"
                    className={cn(secondaryButton, "min-h-9 rounded-lg px-3.5 text-ui")}
                  >
                    Til prosjektene
                  </Link>
                ))}
            </div>
          )}
        </div>
      </div>
    </Root>
    </OpenProject>
  );
}
