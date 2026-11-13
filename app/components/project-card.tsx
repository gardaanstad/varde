import { memo } from "react";
import Image from "next/image";
import {
  Bookmark,
  MapPin,
  Megaphone,
  MessageCircle,
} from "lucide-react";
import {
  categoryLabels,
  formatDate,
  getProjectUpdates,
  hasPhoto,
  type Project,
  projectPhotos,
  projectPlace,
  statuses,
} from "../lib/data";
import type { ListDensity } from "../lib/explore-state";
import { type ProjectNews, unreadCount, unreadSummary } from "../lib/unread";
import { cn } from "../lib/cn";
import { statusTone } from "../lib/ui";
import ImageGallery from "./image-gallery";

type Section = "discussion" | "updates";

// Above the stretched card link, for the stat tooltips.
const cardStat = "relative z-1 inline-flex items-center gap-1.25 tabular-nums";
// One line each, so a compact row keeps one height: 18 + 4 + 22 + 4 + 18.
const meta = "flex min-w-0 items-center text-xs leading-4.5 text-muted";
// Expanded: the counts under the photos, quiet until hovered; above the
// card link.
// No fill, so nothing shifts off the text edge; the hit area reaches past it.
const action = cn(
  "relative z-1 inline-flex h-6 items-center gap-1.5 text-ui font-medium text-muted tabular-nums",
  "transition-colors duration-150 hover:text-ink motion-reduce:transition-none [&>svg]:shrink-0",
  "after:absolute after:-inset-x-1.5 after:-inset-y-1.5 after:rounded-lg focus-visible:outline-none focus-visible:after:outline-2 focus-visible:after:outline-focus",
);
// The hover wash and the card link reach 12px past the text sideways and
// 8px past the padding's content vertically.
const reach = {
  compact: {
    wash: "before:inset-y-2 max-md:before:inset-y-1.5",
    link: "after:inset-y-2 max-md:after:inset-y-1.5",
  },
  expanded: {
    wash: "before:inset-y-3 max-md:before:inset-y-2",
    link: "after:inset-y-3 max-md:after:inset-y-2",
  },
};

/**
 * What is new since the user last opened the project: a dot and a count in
 * the accent colour, at the end of the stats, with the details on hover.
 */
function UnreadMark({
  news,
  className,
}: {
  news: ProjectNews;
  className?: string;
}) {
  const count = unreadCount(news);
  const summary = unreadSummary(news);
  return (
    <span
      className={cn(
        "relative z-1 inline-flex shrink-0 items-center gap-1.25 font-medium whitespace-nowrap text-accent-strong tabular-nums",
        className,
      )}
      data-tooltip={summary}
      data-unread-mark=""
    >
      <i className="size-1.5 shrink-0 rounded-full bg-accent" />
      <span aria-hidden="true">{count === 1 ? "1 ny" : `${count} nye`}</span>
      <span className="sr-only">{summary} siden sist</span>
    </span>
  );
}

/** One project in the results list; the whole card opens the project. */
/** Memoized with stable callbacks, so a list change only renders new cards. */
export default memo(function ProjectCard({
  project,
  commentCount,
  density,
  saved,
  news,
  onOpen,
  onSave,
  onHover,
}: {
  project: Project;
  commentCount: number;
  density: ListDensity;
  saved: boolean;
  /** What is new since the user last opened it, for projects they have. */
  news?: ProjectNews;
  onOpen: (id: string, section?: Section) => void;
  onSave: (id: string) => void;
  /** Pointer or keyboard focus entering (true) or leaving the card. */
  onHover?: (id: string, hovering: boolean) => void;
}) {
  const updates = getProjectUpdates(project);
  const expanded = density === "expanded";
  const labels = categoryLabels(project.categories);
  const fresh = news && unreadCount(news) > 0 ? news : undefined;
  const title = (
    <h2
      className={cn(
        "text-item leading-5.5 text-ink",
        expanded ? "mt-1" : "mt-1 truncate",
      )}
    >
      {/* Stretched over the whole card; other controls sit above it. */}
      <button
        type="button"
        className={cn(
          "text-left outline-none",
          "after:absolute after:inset-x-[-12px] after:rounded-xl max-md:after:inset-x-[-8px]",
          reach[density].link,
          "focus-visible:after:outline-2 focus-visible:after:outline-focus",
        )}
        aria-label={`${project.title} · ${labels.join(", ")} · ${project.city}${fresh ? ` · ${unreadSummary(fresh)}` : ""}`}
        data-press=""
        onClick={() => onOpen(project.id)}
      >
        {project.title}
      </button>
    </h2>
  );
  const status = (
    <span className="inline-flex min-w-0 items-center gap-1.5 font-medium whitespace-nowrap text-ink">
      <i
        className={cn(
          "size-2 shrink-0 rounded-full",
          statusTone[project.status].dot,
        )}
      />
      {statuses[project.status].label}
      {project.year && (
        <span className="font-normal text-muted">· {project.year}</span>
      )}
    </span>
  );
  const commentWord = commentCount === 1 ? "kommentar" : "kommentarer";
  const commentLabel = `${commentCount} ${commentWord}`;
  const updatesTooltip =
    updates.length > 0
      ? `${updates.length} ${updates.length === 1 ? "oppdatering" : "oppdateringer"} · sist ${formatDate(updates[0].date)}`
      : undefined;

  return (
    <li
      className={cn(
        "relative isolate border-b border-border",
        expanded
          ? "py-5 max-md:py-4"
          : "flex items-center gap-4 py-4 max-md:gap-3 max-md:py-3.5",
        // Hover wash bleeds slightly past the text edge, like a list row.
        // Instant, so moving down the list reads as a pointer, not a fade.
        "before:absolute before:inset-x-[-12px] before:-z-1 before:rounded-xl max-md:before:inset-x-[-8px]",
        reach[density].wash,
        "hover:before:bg-surface-muted/65",
      )}
      data-card-id={project.id}
      data-density={density}
      data-unread={fresh ? true : undefined}
      onPointerEnter={(event) => {
        if (event.pointerType === "mouse") onHover?.(project.id, true);
      }}
      onPointerLeave={(event) => {
        if (event.pointerType === "mouse") onHover?.(project.id, false);
      }}
      onFocus={() => onHover?.(project.id, true)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget))
          onHover?.(project.id, false);
      }}
    >
      {expanded ? (
        <>
          {/* Where and what, then where it stands. */}
          <p className={cn(meta, "gap-1")}>
            <MapPin size={13} className="shrink-0" aria-hidden="true" />
            <span className="min-w-0 truncate">
              {projectPlace(project)}
              {labels.length > 0 && ` · ${labels.join(", ")}`}
            </span>
            <span className="ml-auto flex shrink-0 pl-2">{status}</span>
          </p>
          {title}
          <p className="mt-1 line-clamp-2 text-sm leading-5 text-ink-soft">
            {project.description.split("\n")[0]}
          </p>
          <Photos project={project} />
          <div className="mt-3 flex items-center gap-4">
            <button
              type="button"
              className={action}
              aria-label={commentLabel}
              data-press=""
              onClick={() => onOpen(project.id, "discussion")}
            >
              <MessageCircle size={15} aria-hidden="true" />
              <span>
                {commentCount}
                <span className="max-[359px]:hidden">
                  {` ${commentWord}`}
                </span>
              </span>
            </button>
            {updates.length > 0 && (
              <button
                type="button"
                className={action}
                aria-label={updatesTooltip}
                data-tooltip={updatesTooltip}
                data-press=""
                onClick={() => onOpen(project.id, "updates")}
              >
                <Megaphone size={15} aria-hidden="true" />
                <span>
                  {updates.length}
                  <span className="max-[359px]:hidden">
                    {updates.length === 1 ? " oppdatering" : " oppdateringer"}
                  </span>
                </span>
              </button>
            )}
            {fresh && <UnreadMark news={fresh} className="text-ui" />}
            <button
              type="button"
              className={cn(
                action,
                "ml-auto",
                saved && "text-accent hover:text-accent-strong",
              )}
              aria-pressed={saved}
              data-save=""
              data-tooltip={saved ? "Fjern fra lagrede" : undefined}
              onClick={() => onSave(project.id)}
            >
              <Bookmark
                size={15}
                fill={saved ? "currentColor" : "none"}
                aria-hidden="true"
              />
              {saved ? "Lagret" : "Lagre"}
            </button>
          </div>
        </>
      ) : (
        <>
          <div className="min-w-0 flex-1">
            <p className={cn(meta, "gap-1")}>
              <MapPin size={13} className="shrink-0" aria-hidden="true" />
              <span className="min-w-0 truncate">{projectPlace(project)}</span>
              {/* The place gives way, so this fits at any width. */}
              {fresh && <UnreadMark news={fresh} className="ml-auto pl-2" />}
            </p>
            {title}
            {/* Stats sit above the card link for their tooltips; forward clicks. */}
            <div
              className={cn(
                meta,
                "mt-1 cursor-pointer gap-x-3.5 max-md:gap-x-3",
              )}
              data-press=""
              onClick={() => onOpen(project.id)}
            >
              {status}
              <span
                className={cardStat}
                data-tooltip={commentLabel}
              >
                <MessageCircle size={13} aria-hidden="true" />
                {commentCount}
                <span className="sr-only">
                  {` ${commentWord}`}
                </span>
              </span>
              {updates.length > 0 && (
                <span className={cardStat} data-tooltip={updatesTooltip}>
                  <Megaphone size={13} aria-hidden="true" />
                  {updates.length}
                  <span className="sr-only"> oppdateringer</span>
                </span>
              )}
            </div>
          </div>
          {/* As tall as the text beside it, at 4:3. */}
          {hasPhoto(project) && (
            // A narrow sidebar gives the text the room.
            <div className="relative h-16.5 w-22 shrink-0 overflow-hidden rounded-lg bg-surface-muted md:@max-[340px]/list:hidden">
              <Image
                src={project.image}
                alt=""
                fill
                sizes="88px"
                className="object-cover"
              />
            </div>
          )}
        </>
      )}
    </li>
  );
});

/** Expanded: every photo, full width; nothing when the project has none. */
function Photos({ project }: { project: Project }) {
  const photos = projectPhotos(project);
  if (photos.length === 0) return null;
  return (
    // Above the card link: the photos page and open the lightbox.
    <div className="relative z-1 mt-3">
      <ImageGallery
        images={photos}
        label={`Bilder av ${project.title}`}
        // As in the project's own gallery, so opening it reuses the file.
        sizes="(max-width: 768px) 100vw, 560px"
        className="aspect-3/2 rounded-lg"
      />
    </div>
  );
}
