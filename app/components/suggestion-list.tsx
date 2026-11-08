"use client";
import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import dynamic from "next/dynamic";
import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  ArrowUpRight,
  Check,
  ChevronDown,
  Inbox,
  Lightbulb,
  MessageSquareText,
  Pencil,
  Plus,
  TriangleAlert,
  X,
} from "lucide-react";
import { apiRequest, errorMessage } from "../lib/api-client";
import { cn } from "../lib/cn";
import {
  diffParagraphs,
  diffStats,
  diffWords,
  formatDistance,
  geometryChange,
  overlayPaths,
  type DiffPart,
} from "../lib/diff";
import {
  projectHref,
  projectPhotos,
  projectPlace,
  statuses,
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
  controlBase,
  dangerButton,
  fieldControl,
  primaryButton,
  secondaryButton,
  statusTone,
  textButton,
} from "../lib/ui";
import BackLink from "./back-link";
import CategoryIcon from "./category-icon";
import { fields, type FieldId } from "./project-edit";
import RelativeTime from "./relative-time";
import Toast, { type ToastMessage } from "./toast";

const ProjectMap = dynamic(() => import("./project-map"), { ssr: false });

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
const rowAction = cn(
  controlBase,
  "min-h-8 gap-1.5 rounded-lg px-3 text-xs shadow-none max-sm:size-9 max-sm:min-h-9 max-sm:px-0",
);
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
function KindBadge({ kind }: { kind: SuggestionKind }) {
  const Icon = kindIcons[kind];
  return (
    <span
      className="inline-flex h-5.5 shrink-0 items-center gap-1 rounded-md bg-surface-muted px-1.5 text-2xs font-semibold text-ink-soft"
      data-kind={kind}
    >
      <Icon size={12} strokeWidth={2.25} aria-hidden="true" />
      {kindLabels[kind]}
    </span>
  );
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

/**
 * A unified text diff: changed paragraphs with their words marked, runs of
 * unchanged ones folded behind a toggle.
 */
function TextDiff({ before, after }: { before: string; after: string }) {
  const diff = useMemo(() => diffParagraphs(before, after), [before, after]);
  const [shown, setShown] = useState<Set<number>>(new Set());
  const groups: (
    | { type: "same"; texts: string[]; start: number }
    | { type: "change"; parts: DiffPart[] }
  )[] = [];
  diff.forEach((paragraph, index) => {
    const last = groups.at(-1);
    if (paragraph.type === "same")
      if (last?.type === "same") last.texts.push(paragraph.text);
      else groups.push({ type: "same", texts: [paragraph.text], start: index });
    else groups.push(paragraph);
  });
  const paragraph =
    "border-l-2 py-0.5 pl-3 text-ui leading-[1.65] whitespace-pre-wrap wrap-anywhere";
  return (
    <div className="space-y-1.5" data-text-diff="">
      {groups.map((group, index) => {
        if (group.type === "change") {
          const kinds = new Set(group.parts.map((part) => part.type));
          return (
            <p
              key={index}
              className={cn(
                paragraph,
                "text-ink",
                kinds.has("add") && !kinds.has("remove") && !kinds.has("same")
                  ? "border-diff-add-ink/50"
                  : kinds.has("remove") && !kinds.has("add") && !kinds.has("same")
                    ? "border-diff-remove-ink/50"
                    : "border-border-strong",
              )}
            >
              <Parts parts={group.parts} />
            </p>
          );
        }
        if (shown.has(group.start))
          return group.texts.map((text, offset) => (
            <p
              key={`${index}-${offset}`}
              className={cn(paragraph, "border-transparent text-muted")}
            >
              {text}
            </p>
          ));
        return (
          <button
            key={index}
            type="button"
            className="flex min-h-7 w-full items-center gap-1.5 rounded-md bg-surface-subtle px-3 text-left text-xs font-medium text-muted transition-colors hover:bg-surface-muted hover:text-ink"
            onClick={() => setShown(new Set(shown).add(group.start))}
          >
            <ChevronDown size={13} aria-hidden="true" />…{" "}
            {group.texts.length}{" "}
            {group.texts.length === 1 ? "uendret avsnitt" : "uendrede avsnitt"}
          </button>
        );
      })}
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

const changedIds = (changes: CorrectionChanges) =>
  fieldOrder.filter((id) =>
    fields[id].keys.some((key) => key !== "center" && key in changes),
  );

/** One line under the title: what the suggestion is about. */
function summary(suggestion: Suggestion): ReactNode {
  if (suggestion.kind === "update")
    return tipTitle(suggestion.data.text) || suggestion.data.text;
  if (suggestion.kind === "project") {
    const project = suggestion.data.project;
    return (
      <span className="inline-flex min-w-0 items-center gap-1.5">
        <CategoryIcon category={project.category} size={13} />
        <span className="truncate">
          {project.category} · {projectPlace(project)}
        </span>
        <i
          className={cn(
            "ml-1 size-1.75 shrink-0 rounded-full",
            statusTone[project.status].dot,
          )}
          aria-hidden="true"
        />
        <span className="shrink-0">{statuses[project.status].label}</span>
      </span>
    );
  }
  const ids = changedIds(suggestion.data.changes);
  const applied = suggestion.data.applied;
  const appliedIds = applied
    ? ids.filter((id) =>
        fields[id].keys.some((key) => applied.includes(key as CorrectionKey)),
      )
    : undefined;
  const count =
    appliedIds && appliedIds.length !== ids.length
      ? `${appliedIds.length} av ${ids.length} felt`
      : `${ids.length} felt endret`;
  return `${count} · ${ids.map((id) => fields[id].label).join(", ")}`;
}

function CorrectionBody({
  suggestion,
  queue,
  selected,
  onSelect,
}: {
  suggestion: Extract<Suggestion, { kind: "correction" }>;
  queue: boolean;
  selected: FieldId[];
  onSelect: (selected: FieldId[]) => void;
}) {
  const id = useId();
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
        const inputId = `${id}-${field}`;
        const value = (p: Project) => fields[field].show(p);
        const stats =
          field === "description"
            ? diffStats(diffParagraphs(before.description, after.description))
            : undefined;
        return (
          <li
            key={field}
            className={cn(
              "grid items-start gap-x-3 gap-y-1.5 py-2.5",
              queue
                ? "grid-cols-[18px_104px_minmax(0,1fr)] max-sm:grid-cols-[18px_minmax(0,1fr)]"
                : "grid-cols-[104px_minmax(0,1fr)] max-sm:grid-cols-1",
            )}
            data-field={field}
          >
            {queue && (
              <input
                id={inputId}
                type="checkbox"
                className="mt-1 size-4 accent-accent"
                aria-label={`Ta med ${fields[field].label.toLowerCase()}`}
                checked={selected.includes(field)}
                onChange={(event) =>
                  onSelect(
                    event.target.checked
                      ? [...selected, field]
                      : selected.filter((item) => item !== field),
                  )
                }
              />
            )}
            <label
              htmlFor={queue ? inputId : undefined}
              className="flex min-h-6 flex-wrap items-center gap-x-2 gap-y-0.5 text-xs font-medium text-muted"
            >
              {fields[field].label}
              {stats && (
                <span className="font-semibold tabular-nums">
                  <span className="text-diff-add-ink">+{stats.added}</span>{" "}
                  <span className="text-diff-remove-ink">−{stats.removed}</span>
                </span>
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
            </label>
            <div
              className={cn(
                "min-w-0",
                queue && "max-sm:col-start-2",
                !queue && "max-sm:col-start-1",
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
  const facts: FieldId[] = ["year", "developer", "website", "geometry"];
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

function SuggestionRow({
  suggestion,
  tab,
  onReview,
}: {
  suggestion: Suggestion;
  tab: Tab;
  onReview: Review;
}) {
  const bodyId = useId();
  const queue = tab === "queue";
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [overrides, setOverrides] = useState<Overrides>({});
  const [selected, setSelected] = useState<FieldId[]>(() =>
    suggestion.kind === "correction" ? changedIds(suggestion.data.changes) : [],
  );
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const reasonRef = useRef<HTMLInputElement>(null);
  const linked =
    suggestion.projectId &&
    (suggestion.kind !== "project" || suggestion.status === "approved");

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
      setExpanded(true);
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
        keys: selected.flatMap((id) => fields[id].keys) as CorrectionKey[],
      }),
    });
  }
  function startRejecting() {
    setExpanded(true);
    setRejecting(true);
  }

  const meta = (
    <>
      {tab !== "mine" && <span>@{suggestion.author}</span>}
      {tab !== "mine" && <span aria-hidden="true">·</span>}
      <RelativeTime date={suggestion.createdAt} />
    </>
  );
  return (
    <article
      className={cn(
        "group/row transition-colors duration-150 motion-reduce:transition-none",
        expanded ? "bg-surface" : "hover:bg-surface-subtle",
      )}
      aria-labelledby={`${bodyId}-title`}
      data-suggestion={suggestion.kind}
      data-expanded={expanded || undefined}
    >
      <div className="flex items-start gap-3 px-4 py-3 max-sm:gap-2 max-sm:px-3.5">
        <button
          type="button"
          className="flex min-w-0 flex-1 flex-col items-stretch gap-1 rounded-md text-left outline-offset-4"
          aria-expanded={expanded}
          aria-controls={bodyId}
          onClick={() => setExpanded(!expanded)}
          data-row-toggle=""
        >
          <span className="flex min-w-0 items-center gap-2">
            <KindBadge kind={suggestion.kind} />
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
            <span className="flex shrink-0 items-center gap-1.5 text-xs text-muted max-sm:hidden">
              {meta}
            </span>
          </span>
          <span className="flex min-w-0 items-center gap-1.5 text-xs text-muted">
            <span className="min-w-0 truncate" data-summary="">
              {summary(suggestion)}
            </span>
          </span>
          <span className="flex min-w-0 items-center gap-1.5 text-2xs text-muted sm:hidden">
            {meta}
          </span>
          {suggestion.status === "rejected" && suggestion.reason && (
            <span className="truncate text-xs text-danger">
              {suggestion.reason}
            </span>
          )}
        </button>
        <div className="flex shrink-0 items-center gap-1.5 pt-px">
          {queue ? (
            <>
              <button
                type="button"
                className={cn(secondaryButton, rowAction)}
                aria-label="Avvis"
                onClick={startRejecting}
                disabled={busy}
              >
                <X size={15} className="sm:hidden" aria-hidden="true" />
                <span className="max-sm:hidden">Avvis</span>
              </button>
              <button
                type="button"
                className={cn(primaryButton, rowAction)}
                aria-label="Godkjenn"
                disabled={
                  busy ||
                  (suggestion.kind === "correction" && !selected.length)
                }
                onClick={approve}
              >
                <Check size={15} className="sm:hidden" aria-hidden="true" />
                <span className="max-sm:hidden">Godkjenn</span>
              </button>
            </>
          ) : (
            <StatusBadge status={suggestion.status} />
          )}
          {/* A second, pointer-only target for the row's toggle. */}
          <button
            type="button"
            tabIndex={-1}
            aria-hidden="true"
            className="grid size-8 place-items-center rounded-lg text-muted hover:bg-ink/[0.05] hover:text-ink max-sm:hidden"
            onClick={() => setExpanded(!expanded)}
          >
            <ChevronDown
              size={16}
              className={cn(
                "transition-transform duration-200 motion-reduce:transition-none",
                expanded && "rotate-180",
              )}
            />
          </button>
        </div>
      </div>
      <div
        id={bodyId}
        hidden={!expanded}
        className="space-y-4 px-4 pb-4 max-sm:px-3.5"
      >
        {expanded && (
          <>
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
                selected={selected}
                onSelect={setSelected}
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
              <p className="flex gap-2 rounded-lg bg-surface-subtle px-3 py-2 text-ui leading-relaxed whitespace-pre-wrap wrap-anywhere text-ink-soft">
                <MessageSquareText
                  size={14}
                  className="mt-1 shrink-0 text-muted"
                  aria-label="Merknad"
                />
                {suggestion.note}
              </p>
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
                    if (event.key === "Enter")
                      void run({ action: "reject", id: suggestion.id, reason });
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
                    onClick={() =>
                      void run({ action: "reject", id: suggestion.id, reason })
                    }
                  >
                    Avvis forslag
                  </button>
                </div>
              </div>
            )}
            {((queue && suggestion.kind !== "correction") || linked) && (
              <div className="-mb-1 flex items-center gap-4">
                {queue && suggestion.kind !== "correction" && (
                  <button
                    type="button"
                    className={cn(textButton, "-ml-2 min-h-8 text-ui")}
                    aria-pressed={editing}
                    onClick={() => setEditing(!editing)}
                  >
                    <Pencil size={13} aria-hidden="true" />
                    {editing ? "Ferdig" : "Rediger"}
                  </button>
                )}
                {linked && (
                  <Link
                    href={projectHref(suggestion.projectId!)}
                    className="ml-auto inline-flex min-h-8 items-center gap-1 text-ui font-medium text-accent hover:underline hover:underline-offset-4"
                  >
                    Åpne prosjekt
                    <ArrowRight size={14} aria-hidden="true" />
                  </Link>
                )}
              </div>
            )}
          </>
        )}
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
}: {
  initial: SuggestionLists;
  moderator: boolean;
}) {
  const [lists, setLists] = useState(initial);
  const [tab, setTab] = useState<Tab>(moderator ? "queue" : "mine");
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const listRef = useRef<HTMLUListElement>(null);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 6000);
    return () => clearTimeout(timer);
  }, [toast]);
  const queue = lists.queue ?? [];
  const handled = lists.handled ?? [];
  const tabs: { id: Tab; label: string; count?: number }[] = moderator
    ? [
        { id: "queue", label: "Til behandling", count: queue.length },
        { id: "handled", label: "Behandlet" },
        ...(lists.mine.length ? [{ id: "mine" as const, label: "Mine" }] : []),
      ]
    : [];
  const items =
    tab === "queue" ? queue : tab === "handled" ? handled : lists.mine;

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
    setToast({
      message: mutation.action === "approve" ? "Godkjent" : "Avvist",
    });
    // Keyboard reviews carry on with the next suggestion.
    requestAnimationFrame(() => {
      const rows =
        listRef.current?.querySelectorAll<HTMLElement>("[data-row-toggle]");
      if (rows?.length && index >= 0)
        rows[Math.min(index, rows.length - 1)].focus();
    });
  }

  return (
    <main className="min-h-dvh bg-canvas px-5 py-5 sm:px-10 sm:py-8 max-sm:px-3">
      <div className="mx-auto w-full max-w-200">
        <BackLink href="/" />
        <div className="mt-3 mb-4 flex items-baseline gap-3 px-1">
          <h1 className="text-[26px] leading-tight font-semibold tracking-[-0.6px]">
            {moderator ? "Forslag" : "Mine forslag"}
          </h1>
          {!moderator && lists.mine.length > 0 && (
            <span className="text-sm text-muted tabular-nums">
              {lists.mine.length}
            </span>
          )}
        </div>
        {tabs.length > 0 && (
          <nav
            className="mb-4 flex gap-6 border-b border-border px-1"
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
                onClick={() => setTab(id)}
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
          {items.length ? (
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
              {tab === "mine" && !moderator && (
                <Link
                  href="/"
                  className={cn(secondaryButton, "min-h-9 rounded-lg px-3.5 text-ui")}
                >
                  Til prosjektene
                </Link>
              )}
            </div>
          )}
        </div>
      </div>
      {toast && (
        <Toast toast={toast} mobile={false} onClose={() => setToast(null)} />
      )}
    </main>
  );
}
