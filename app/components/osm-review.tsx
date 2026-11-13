"use client";
import {
  useCallback,
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Ellipsis,
  ExternalLink,
  Eye,
  EyeOff,
  LoaderCircle,
  MapPinOff,
  Plus,
  RefreshCw,
  RotateCcw,
  X,
} from "lucide-react";
import type { Point, Project } from "../lib/data";
import { apiRequest, errorMessage } from "../lib/api-client";
import {
  covered,
  formatLength,
  formatRef,
  matchProject,
  type OsmCandidate,
  osmColors,
  osmDraft,
  type OsmFeed,
  type OsmKind,
  osmKindLabels,
  osmKinds,
  type OsmMatch,
  osmModeLabels,
  osmPlace,
  type OsmStatus,
  osmStatuses,
  osmStatusLabels,
  osmTitles,
} from "../lib/osm-candidates";
import { cn } from "../lib/cn";
import { iconButton, primaryButton, secondaryButton } from "../lib/ui";
import type { OsmLayer, OsmLine } from "./project-map";
import type { ToastMessage } from "./toast";

const modeKey = "varde-osm-mode";
const modeEvent = "varde-osm-mode";
// Without browser storage, the mode still lasts for this visit.
let modeFallback = false;
function storedMode() {
  try {
    return localStorage.getItem(modeKey) === "1";
  } catch {
    return modeFallback;
  }
}
function storeMode(on: boolean) {
  modeFallback = on;
  try {
    if (on) localStorage.setItem(modeKey, "1");
    else localStorage.removeItem(modeKey);
  } catch {
    /* The fallback above holds it. */
  }
  window.dispatchEvent(new Event(modeEvent));
}
function subscribeMode(callback: () => void) {
  window.addEventListener(modeEvent, callback);
  window.addEventListener("storage", callback);
  return () => {
    window.removeEventListener(modeEvent, callback);
    window.removeEventListener("storage", callback);
  };
}

/** Whether the OSM mode is on in this browser, moderator or not. */
export const useOsmModeStored = () =>
  useSyncExternalStore(subscribeMode, storedMode, () => false);

type Entry = OsmLine & { found: OsmMatch | null };
const noEntries: Entry[] = [];
const allKinds = { rail: true, road: true };
const allStatuses = { construction: true, proposed: true };

/**
 * Moderators' OSM mode: railways and roads under construction and proposed
 * in OpenStreetMap, drawn on the map as candidates for new projects. What
 * a project already covers is left out of the review; the rest can be
 * stepped through, started as a project, or hidden for every moderator.
 * OSM is only read when a moderator asks.
 */
export function useOsmReview({
  allowed,
  projects,
  onFrame,
  notify,
  beforeToggle,
}: {
  /** Moderators only; the server checks too. */
  allowed: boolean;
  /** Runs as the mode turns on or off, before anything changes. */
  beforeToggle?: () => void;
  projects: Project[];
  /** Frames a candidate on the map. */
  onFrame: (points: Point[]) => void;
  notify: (toast: ToastMessage) => void;
}) {
  const stored = useOsmModeStored();
  const on = allowed && stored;
  const [feed, setFeed] = useState<OsmFeed | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [kinds, setKinds] = useState<Record<OsmKind, boolean>>(allKinds);
  const [statuses, setStatuses] =
    useState<Record<OsmStatus, boolean>>(allStatuses);
  const [showHidden, setShowHidden] = useState(false);
  // The map's own projects out of the way while reviewing.
  const [hideProjects, setHideProjects] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const requested = useRef(false);

  // The candidates as last read: from the server's store, not from OSM.
  const read = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setFeed(await apiRequest<OsmFeed>("/api/osm-candidates"));
    } catch (failure) {
      setError(errorMessage(failure, "Kunne ikke hente kandidatene."));
    } finally {
      setLoading(false);
    }
  }, []);
  /** Reads OpenStreetMap again: only ever on a moderator's request. */
  async function refresh() {
    if (refreshing) return;
    setRefreshing(true);
    setError("");
    try {
      setFeed(
        await apiRequest<OsmFeed>("/api/osm-candidates", {
          method: "POST",
          body: JSON.stringify({ action: "refresh" }),
        }),
      );
    } catch (failure) {
      setError(errorMessage(failure, "Kunne ikke hente fra OpenStreetMap."));
    } finally {
      setRefreshing(false);
    }
  }
  const start = useEffectEvent(() => {
    if (requested.current) return;
    requested.current = true;
    void read();
  });
  useEffect(() => {
    if (on) start();
  }, [on]);

  const candidates = feed?.candidates;
  const titles = useMemo(() => osmTitles(candidates ?? []), [candidates]);
  const matches = useMemo(
    () =>
      new Map(
        (candidates ?? []).map((candidate) => [
          candidate.id,
          matchProject(candidate, projects),
        ]),
      ),
    [candidates, projects],
  );
  const dismissed = useMemo(() => new Set(feed?.dismissed), [feed?.dismissed]);
  const entries = useMemo<Entry[]>(() => {
    if (!candidates) return noEntries;
    return candidates.flatMap((candidate) => {
      const found = matches.get(candidate.id) ?? null;
      const state = dismissed.has(candidate.id)
        ? "dismissed"
        : covered(found)
          ? "exists"
          : "new";
      if (state === "dismissed" && !showHidden) return [];
      return [
        {
          candidate,
          title: titles.get(candidate.id)!,
          state,
          found,
          match: found?.project.title,
        },
      ];
    });
  }, [candidates, matches, dismissed, showHidden, titles]);
  const visible = useMemo(
    () =>
      entries.filter(
        ({ candidate }) => kinds[candidate.kind] && statuses[candidate.status],
      ),
    [entries, kinds, statuses],
  );
  // What's left to review, longest first.
  const queue = useMemo(
    () => visible.filter((entry) => entry.state === "new"),
    [visible],
  );
  const selected =
    visible.find((entry) => entry.candidate.id === selectedId) ?? null;

  function toggle() {
    beforeToggle?.();
    if (on) setSelectedId(null);
    storeMode(!on);
  }
  /** Selects a neighbour in the queue, and frames it. */
  function step(direction: 1 | -1) {
    if (!queue.length) return;
    const index = queue.findIndex((entry) => entry.candidate.id === selectedId);
    const next =
      index < 0
        ? direction === 1
          ? 0
          : queue.length - 1
        : (index + direction + queue.length) % queue.length;
    show(queue[next].candidate);
  }
  function show(candidate: OsmCandidate) {
    setSelectedId(candidate.id);
    onFrame(candidate.path);
  }
  async function setDismissed(ids: string[], value: boolean) {
    const apply = (hidden: boolean) =>
      setFeed(
        (current) =>
          current && {
            ...current,
            dismissed: [
              ...current.dismissed.filter((other) => !ids.includes(other)),
              ...(hidden ? ids : []),
            ],
          },
      );
    apply(value);
    try {
      await apiRequest("/api/osm-candidates", {
        method: "POST",
        body: JSON.stringify({ action: "dismiss", ids, dismissed: value }),
      });
    } catch (failure) {
      apply(!value);
      notify({ message: errorMessage(failure, "Kunne ikke lagre endringen.") });
      return false;
    }
    return true;
  }
  /** Hides a candidate for every moderator, and moves on to the next. */
  async function dismiss(id: string) {
    const index = queue.findIndex((entry) => entry.candidate.id === id);
    const rest = queue.filter((entry) => entry.candidate.id !== id);
    const next = rest.length ? rest[Math.max(0, index) % rest.length] : null;
    if (!(await setDismissed([id], true))) return;
    if (next) show(next.candidate);
    else setSelectedId(null);
    notify({
      message: "Skjult",
      undo: () => {
        void setDismissed([id], false).then((done) => done && setSelectedId(id));
      },
    });
  }
  /** Brings back every hidden candidate, for every moderator. */
  async function resetDismissed() {
    const ids = feed?.dismissed ?? [];
    if (!ids.length || !(await setDismissed(ids, false))) return;
    notify({
      message: ids.length === 1 ? "1 vises igjen" : `${ids.length} vises igjen`,
      undo: () => void setDismissed(ids, true),
    });
  }

  const layer = useMemo<OsmLayer | undefined>(
    () =>
      on ? { lines: visible, selectedId, onSelect: setSelectedId } : undefined,
    [on, visible, selectedId],
  );

  return {
    allowed,
    on,
    toggle,
    layer,
    feed,
    loading,
    refreshing,
    error,
    refresh,
    kinds,
    setKinds,
    statuses,
    setStatuses,
    showHidden,
    setShowHidden,
    hideProjects,
    setHideProjects,
    resetDismissed,
    queue,
    selected,
    select: setSelectedId,
    step,
    dismiss,
    restore: (id: string) => void setDismissed([id], false),
  };
}
export type OsmReview = ReturnType<typeof useOsmReview>;

const smallIcon = cn(iconButton, "size-8 rounded-lg pointer-coarse:size-10");
const filterChip = cn(
  "group/chip inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full border border-transparent pr-2.5 pl-1.5 text-xs font-medium text-muted",
  "transition-[color,background-color,border-color] duration-150 motion-reduce:transition-none",
  "hover:bg-ink/[0.05] hover:text-ink aria-checked:text-ink",
  "pointer-coarse:h-9",
);
const fetchedFormat = new Intl.DateTimeFormat("nb-NO", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

/** A checkbox, filled with the given colour when checked. */
function Box({ checked, color }: { checked: boolean; color?: string }) {
  return (
    <span
      className={cn(
        "flex size-3.5 shrink-0 items-center justify-center rounded-[4px] border-[1.5px] text-surface",
        checked ? "border-transparent" : "border-border-strong bg-surface",
        checked && !color && "bg-accent",
      )}
      style={checked && color ? { backgroundColor: color } : undefined}
      aria-hidden="true"
    >
      {checked && <Check size={10} strokeWidth={3.5} />}
    </span>
  );
}
/** A line sample: solid under construction, dotted when proposed. */
function StatusSample({ status, on }: { status: OsmStatus; on: boolean }) {
  return (
    <svg
      width="16"
      height="6"
      aria-hidden="true"
      // Phones keep the bar to two rows.
      className={cn("shrink-0 max-sm:hidden", !on && "opacity-50")}
    >
      <line
        x1="3"
        y1="3"
        x2="13"
        y2="3"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeDasharray={status === "proposed" ? "0.1 4.5" : undefined}
      />
    </svg>
  );
}

/** The ⋯ menu: hidden candidates, and reading OSM again. */
function MoreMenu({ review }: { review: OsmReview }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopImmediatePropagation();
      setOpen(false);
      root.current?.querySelector<HTMLButtonElement>("button")?.focus();
    };
    document.addEventListener("pointerdown", outside);
    window.addEventListener("keydown", escape, true);
    return () => {
      document.removeEventListener("pointerdown", outside);
      window.removeEventListener("keydown", escape, true);
    };
  }, [open]);
  const hidden = review.feed?.dismissed.length ?? 0;
  const fetchedAt = review.feed?.fetchedAt;
  const item =
    "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-ui text-ink hover:bg-surface-muted disabled:opacity-45 [&>svg]:shrink-0 [&>svg]:text-muted";
  return (
    <div ref={root} className="relative">
      <button
        type="button"
        className={smallIcon}
        aria-label="Flere valg"
        aria-expanded={open}
        aria-haspopup="menu"
        data-tooltip={open ? undefined : "Flere valg"}
        onClick={() => setOpen(!open)}
      >
        <Ellipsis size={17} aria-hidden="true" />
      </button>
      {open && (
        <div
          role="menu"
          className="absolute top-full right-0 z-10 mt-1.5 w-64 rounded-xl border border-border bg-surface p-1.5 shadow-popover"
        >
          <button
            type="button"
            role="menuitemcheckbox"
            aria-checked={review.showHidden}
            className={item}
            disabled={!hidden && !review.showHidden}
            onClick={() => {
              review.setShowHidden(!review.showHidden);
              setOpen(false);
            }}
          >
            {review.showHidden ? (
              <EyeOff size={16} aria-hidden="true" />
            ) : (
              <Eye size={16} aria-hidden="true" />
            )}
            <span className="flex-1">
              {review.showHidden ? "Ikke vis skjulte" : "Vis skjulte"}
            </span>
            <span className="text-xs text-muted tabular-nums">{hidden}</span>
          </button>
          <button
            type="button"
            role="menuitem"
            className={item}
            disabled={!hidden}
            onClick={() => {
              setOpen(false);
              void review.resetDismissed();
            }}
          >
            <RotateCcw size={16} aria-hidden="true" />
            Nullstill skjulte
          </button>
          <div className="my-1 border-t border-border" />
          <button
            type="button"
            role="menuitemcheckbox"
            aria-checked={review.hideProjects}
            className={item}
            onClick={() => {
              review.setHideProjects(!review.hideProjects);
              setOpen(false);
            }}
          >
            <MapPinOff size={16} aria-hidden="true" />
            <span className="flex-1">Skjul eksisterende prosjekter</span>
            {review.hideProjects && (
              <Check size={16} className="text-accent!" aria-hidden="true" />
            )}
          </button>
          <div className="my-1 border-t border-border" />
          <button
            type="button"
            role="menuitem"
            className={item}
            disabled={review.refreshing}
            onClick={() => {
              setOpen(false);
              void review.refresh();
            }}
          >
            <RefreshCw size={16} aria-hidden="true" />
            <span className="flex flex-col">
              Oppdater fra OpenStreetMap
              {fetchedAt && (
                <span className="text-xs text-muted">
                  Hentet {fetchedFormat.format(new Date(fetchedAt))}
                </span>
              )}
            </span>
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * The OSM mode over the map: a bar with what to show, stepping and the
 * mode's own close; under it, the selected candidate and what can be done
 * with it.
 */
export function OsmPanel({
  review,
  keyboard,
  onCreate,
  onOpenProject,
  className,
}: {
  review: OsmReview;
  /** j/k step through candidates, Escape lets go; off under panels. */
  keyboard: boolean;
  onCreate: (draft: Partial<Project>) => void;
  onOpenProject: (id: string) => void;
  className?: string;
}) {
  const { feed, selected, queue } = review;
  const position = selected
    ? queue.findIndex((entry) => entry.candidate.id === selected.candidate.id)
    : -1;
  const onKey = useEffectEvent((event: KeyboardEvent) => {
    if (event.metaKey || event.ctrlKey || event.altKey || event.defaultPrevented)
      return;
    const target = event.target as HTMLElement | null;
    if (target?.closest("input, textarea, select, [contenteditable], dialog, [role=menu]"))
      return;
    if (event.key === "j") review.step(1);
    else if (event.key === "k") review.step(-1);
    else if (event.key === "Escape" && review.selected) review.select(null);
    else return;
    event.preventDefault();
  });
  useEffect(() => {
    if (!keyboard) return;
    const listener = (event: KeyboardEvent) => onKey(event);
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, [keyboard]);

  if (!review.on) return null;
  const candidate = selected?.candidate;
  const exists = selected?.state === "exists";
  const empty = feed && !feed.fetchedAt;
  return (
    <div
      role="region"
      aria-label="Nye veier og baner fra OpenStreetMap"
      data-osm-panel=""
      className={cn("flex w-[min(460px,calc(100%-24px))] flex-col gap-2", className)}
    >
      <div className="rounded-xl border border-border bg-surface py-1 pr-1 pl-1.5 shadow-popover">
        <div className="flex items-center gap-0.5">
          {osmKinds.map((kind) => (
            <button
              key={kind}
              type="button"
              role="checkbox"
              aria-checked={review.kinds[kind]}
              className={filterChip}
              onClick={() =>
                review.setKinds({ ...review.kinds, [kind]: !review.kinds[kind] })
              }
            >
              <Box checked={review.kinds[kind]} color={osmColors[kind]} />
              {osmKindLabels[kind]}
            </button>
          ))}
          <div className="ml-auto flex items-center gap-0.5">
            <MoreMenu review={review} />
            <span className="mx-1 h-5 w-px bg-border" aria-hidden="true" />
            <button
              type="button"
              className={smallIcon}
              aria-label="Slå av nye veier og baner"
              data-tooltip="Slå av"
              onClick={review.toggle}
            >
              <X size={17} aria-hidden="true" />
            </button>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-0.5">
          {osmStatuses.map((status) => (
            <button
              key={status}
              type="button"
              role="checkbox"
              aria-checked={review.statuses[status]}
              className={filterChip}
              onClick={() =>
                review.setStatuses({
                  ...review.statuses,
                  [status]: !review.statuses[status],
                })
              }
            >
              <Box checked={review.statuses[status]} />
              <StatusSample status={status} on={review.statuses[status]} />
              {osmStatusLabels[status]}
            </button>
          ))}
          <div className="ml-auto flex items-center">
            <button
              type="button"
              className={smallIcon}
              aria-label="Forrige"
              data-tooltip="Forrige · K"
              disabled={!queue.length}
              onClick={() => review.step(-1)}
            >
              <ChevronLeft size={17} aria-hidden="true" />
            </button>
            {position >= 0 && (
              <span
                className="px-0.5 text-xs text-muted tabular-nums max-sm:hidden"
                data-osm-position=""
              >
                {position + 1} / {queue.length}
              </span>
            )}
            <button
              type="button"
              className={smallIcon}
              aria-label="Neste"
              data-tooltip="Neste · J"
              disabled={!queue.length}
              onClick={() => review.step(1)}
            >
              <ChevronRight size={17} aria-hidden="true" />
            </button>
          </div>
        </div>
        {(review.loading || review.refreshing || review.error || empty) && (
          <div
            className="mt-1 flex min-h-9 items-center gap-2 border-t border-border px-1.5 pt-1 text-xs text-muted"
            role="status"
          >
            {review.loading || review.refreshing ? (
              <>
                <LoaderCircle
                  size={15}
                  className="shrink-0 animate-spin motion-reduce:animate-none"
                  aria-hidden="true"
                />
                {review.refreshing ? "Henter fra OpenStreetMap …" : "Laster …"}
              </>
            ) : (
              <>
                <span className="mr-auto">{review.error}</span>
                {empty && (
                  <button
                    type="button"
                    className={cn(primaryButton, "min-h-8 rounded-lg px-3 text-xs")}
                    onClick={() => void review.refresh()}
                  >
                    <RefreshCw size={14} aria-hidden="true" />
                    Hent fra OpenStreetMap
                  </button>
                )}
              </>
            )}
          </div>
        )}
      </div>
      {selected && candidate && (
        <div
          className="rounded-xl border border-border bg-surface px-3 pt-2.5 pb-3 shadow-popover"
          data-osm-selected={candidate.id}
        >
          <div className="flex items-start gap-2">
            <h2 className="min-w-0 flex-1 text-ui leading-snug font-semibold text-ink">
              {selected.title}
            </h2>
            <button
              type="button"
              // Over the card's padding, so the title row keeps its height.
              className={cn(smallIcon, "-my-1.5 -mr-1.5")}
              aria-label="Fjern valget"
              data-tooltip="Fjern valget"
              onClick={() => review.select(null)}
            >
              <X size={15} aria-hidden="true" />
            </button>
          </div>
          <p className="mt-0.5 text-xs text-muted">
            {[
              osmStatusLabels[candidate.status],
              osmModeLabels[candidate.mode],
              candidate.ref && formatRef(candidate.ref),
              formatLength(candidate.length),
              osmPlace(candidate),
              candidate.opening,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
          {selected.found && (
            <p className="mt-2 flex min-w-0 items-baseline gap-1 text-xs text-muted">
              <span className="shrink-0">{exists ? "Finnes:" : "Overlapper:"}</span>
              <button
                type="button"
                className="min-w-0 truncate font-medium text-accent hover:underline hover:underline-offset-2"
                onClick={() => onOpenProject(selected.found!.project.id)}
              >
                {selected.found.project.title}
              </button>
              {!exists && (
                <span className="shrink-0 tabular-nums">
                  {Math.round(selected.found.share * 100)} %
                </span>
              )}
            </p>
          )}
          <div className="mt-3 flex items-center gap-1.5">
            <button
              type="button"
              className={cn(
                exists ? secondaryButton : primaryButton,
                "min-h-9 rounded-lg px-3 text-ui",
              )}
              onClick={() => onCreate(osmDraft(candidate, selected.title))}
            >
              <Plus size={16} aria-hidden="true" />
              {exists ? "Opprett likevel" : "Opprett prosjekt"}
            </button>
            {selected.state === "dismissed" ? (
              <button
                type="button"
                className={cn(secondaryButton, "min-h-9 rounded-lg px-3 text-ui")}
                onClick={() => review.restore(candidate.id)}
              >
                <Eye size={15} aria-hidden="true" />
                Vis igjen
              </button>
            ) : (
              !exists && (
                <button
                  type="button"
                  className={cn(secondaryButton, "min-h-9 rounded-lg px-3 text-ui")}
                  onClick={() => void review.dismiss(candidate.id)}
                >
                  <EyeOff size={15} aria-hidden="true" />
                  Skjul
                </button>
              )
            )}
            <a
              className={cn(smallIcon, "ml-auto")}
              href={`https://www.openstreetmap.org/way/${candidate.ways[0]}`}
              target="_blank"
              rel="noreferrer"
              aria-label="Åpne i OpenStreetMap"
              data-tooltip="Åpne i OpenStreetMap"
            >
              <ExternalLink size={15} aria-hidden="true" />
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
