import { memo } from "react";
import Image from "next/image";
import { MapPin, Megaphone, MessageCircle } from "lucide-react";
import {
  categoryLabels,
  leadCategory,
  formatDate,
  getProjectUpdates,
  hasPhoto,
  type Project,
  projectPlace,
  statuses,
} from "../lib/data";
import { cn } from "../lib/cn";
import { statusTone } from "../lib/ui";
import ProjectPlaceholder from "./project-placeholder";

// Above the stretched card link, for the stat tooltips.
const cardStat = "relative z-1 inline-flex items-center gap-1.25 tabular-nums";

/** One project in the results list; the whole card opens the project. */
/** Memoized with stable callbacks, so a list change only renders new cards. */
export default memo(function ProjectCard({
  project,
  commentCount,
  onOpen,
  onHover,
}: {
  project: Project;
  commentCount: number;
  onOpen: (id: string) => void;
  /** Pointer or keyboard focus entering (true) or leaving the card. */
  onHover?: (id: string, hovering: boolean) => void;
}) {
  const updates = getProjectUpdates(project);
  return (
    <li
      className={cn(
        "relative isolate flex items-start gap-4 border-b border-border py-4 max-md:gap-3 max-md:py-3.5",
        // Hover wash bleeds slightly past the text edge, like a list row.
        // Instant, so moving down the list reads as a pointer, not a fade.
        "before:absolute before:inset-x-[-12px] before:inset-y-1 before:-z-1 before:rounded-xl",
        "hover:before:bg-surface-muted/65 max-md:before:inset-x-[-8px] max-md:before:inset-y-0.5",
      )}
      data-card-id={project.id}
      onPointerEnter={(event) => {
        if (event.pointerType === "mouse") onHover?.(project.id, true);
      }}
      onPointerLeave={(event) => {
        if (event.pointerType === "mouse") onHover?.(project.id, false);
      }}
      onFocus={() => onHover?.(project.id, true)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) onHover?.(project.id, false);
      }}
    >
      <div className="min-w-0 flex-1">
        <h2 className="text-item text-ink">
          {/* Stretched over the whole card; other controls sit above it. */}
          <button
            type="button"
            className={cn(
              "text-left outline-none",
              "after:absolute after:inset-x-[-12px] after:inset-y-1 after:rounded-xl max-md:after:inset-x-[-8px] max-md:after:inset-y-0.5",
              "focus-visible:after:outline-2 focus-visible:after:outline-focus",
            )}
            aria-label={`${project.title} · ${categoryLabels(project.categories).join(", ")} · ${project.city}`}
            onClick={() => onOpen(project.id)}
          >
            {project.title}
          </button>
        </h2>
        <p className="mt-0.5 flex min-w-0 items-center gap-1 text-xs leading-4.5 text-muted">
          <MapPin size={14} className="shrink-0" aria-hidden="true" />
          <span className="min-w-0 truncate">{projectPlace(project)}</span>
        </p>
        <p className="mt-1.5 line-clamp-2 text-sm leading-normal text-ink-soft max-md:text-ui">
          {project.description.split("\n")[0]}
        </p>
        {/* Stats sit above the card link for their tooltips; forward clicks. */}
        <div
          className="mt-2 flex min-h-4.5 cursor-pointer items-center gap-x-3.5 gap-y-1 text-xs leading-4.5 text-muted max-md:gap-x-3"
          onClick={() => onOpen(project.id)}
        >
          <span className="inline-flex items-center gap-1.5 font-medium whitespace-nowrap text-ink">
            <i
              className={cn(
                "size-2 rounded-full",
                statusTone[project.status].dot,
              )}
            />
            {statuses[project.status].label}
            {project.year && (
              <span className="font-normal text-muted">· {project.year}</span>
            )}
          </span>
          <span className={cardStat} data-tooltip={`${commentCount} innspill`}>
            <MessageCircle size={14} aria-hidden="true" />
            {commentCount}
            <span className="sr-only"> innspill</span>
          </span>
          {updates.length > 0 && (
            <span
              className={cardStat}
              data-tooltip={`${updates.length} ${updates.length === 1 ? "oppdatering" : "oppdateringer"} · sist ${formatDate(updates[0].date)}`}
            >
              <Megaphone size={14} aria-hidden="true" />
              {updates.length}
              <span className="sr-only"> oppdateringer</span>
            </span>
          )}
        </div>
      </div>
      {/* Mobile: a square thumbnail, top-aligned with the title. */}
      <div className="relative mt-0.5 aspect-4/3 w-28 shrink-0 overflow-hidden rounded-lg bg-surface-muted max-md:aspect-square max-md:w-18">
        {hasPhoto(project) ? (
          <Image
            src={project.image}
            alt=""
            fill
            sizes="(max-width: 768px) 96px, 120px"
            className="object-cover"
          />
        ) : (
          <ProjectPlaceholder
            category={leadCategory(project.categories)}
            iconSize={16}
            className="bg-size-[12px_12px]"
          />
        )}
      </div>
    </li>
  );
});
