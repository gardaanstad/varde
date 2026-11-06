"use client";

import { useEffect, useState, type ReactNode, type RefObject } from "react";
import { Bookmark, Check, MapPin, Pencil, Share2, X } from "lucide-react";
import { type Project, projectPlace, statuses } from "../lib/data";
import { cn } from "../lib/cn";
import { fieldControl, iconButton, statusTone } from "../lib/ui";
import CategoryIcon from "./category-icon";
import {
  EditField,
  editState,
  finalize,
  useProjectEdit,
} from "./project-edit";

const headerIconButton = cn(
  iconButton,
  "rounded-lg active:scale-100 active:text-accent pointer-fine:active:scale-[0.97]",
);

/**
 * Desktop: the body slides this far up under the bar, whose bottom strip stays
 * see-through until the detail row's divider reaches it. The bar can then be
 * taller (room below the title once scrolled) without pushing the row down.
 */
export const headerOverlap = 10;

const metaItem = "inline-flex items-center gap-1.5";

type HeaderProps = {
  project: Project;
  /** In the mobile drawer, which has no detail row below the bar. */
  embedded?: boolean;
  /** Shown before the close button, hidden while editing. */
  actions: ReactNode;
  scrollRootRef: RefObject<HTMLDivElement | null>;
  onClose: () => void;
};

type ProjectActionsProps = {
  /** Enters edit mode; moderators only. */
  onEdit?: () => void;
  copied: boolean;
  saved: boolean;
  onSave: () => void;
  onShare: () => void;
  onMap: () => void;
};

export function ProjectActions({
  onEdit,
  copied,
  saved,
  onSave,
  onShare,
  onMap,
}: ProjectActionsProps) {
  return (
    <>
      {onEdit && (
        <button
          type="button"
          className={headerIconButton}
          aria-label="Rediger prosjekt"
          data-tooltip="Rediger"
          onClick={onEdit}
        >
          <Pencil size={18} />
        </button>
      )}
      <button
        type="button"
        className={headerIconButton}
        onClick={onSave}
        aria-pressed={saved}
        aria-label={saved ? "Fjern fra lagrede" : "Lagre prosjekt"}
        data-tooltip={saved ? "Fjern fra lagrede" : "Lagre"}
      >
        <Bookmark size={18} fill={saved ? "currentColor" : "none"} />
      </button>
      <button
        type="button"
        className={cn(headerIconButton, "data-[state=copied]:text-accent")}
        data-state={copied ? "copied" : "idle"}
        onClick={onShare}
        data-tooltip={copied ? "Lenke kopiert" : "Kopier lenke"}
        aria-label={copied ? "Lenke kopiert" : "Kopier lenke"}
      >
        {copied ? <Check size={18} /> : <Share2 size={18} />}
      </button>
      <button
        type="button"
        className={headerIconButton}
        onClick={onMap}
        data-tooltip="Vis i kartet"
        aria-label="Vis i kartet"
      >
        <MapPin size={18} />
      </button>
    </>
  );
}

export default function ProjectPostHeader({
  project,
  embedded = false,
  actions,
  scrollRootRef,
  onClose,
}: HeaderProps) {
  const [compact, setCompact] = useState(false);
  const overlap = embedded ? 0 : headerOverlap;
  const edit = useProjectEdit();
  const editing = Boolean(edit);

  useEffect(() => {
    const root = scrollRootRef.current;
    const details = root?.querySelector("[data-project-header-hero]");
    if (!root || !details) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        const rootTop =
          entry.rootBounds?.top ?? root.getBoundingClientRect().top;
        setCompact(
          !entry.isIntersecting && entry.boundingClientRect.bottom <= rootTop,
        );
      },
      {
        root,
        rootMargin: `-${overlap}px 0px 0px 0px`,
        threshold: 0,
      },
    );

    observer.observe(details);
    return () => observer.disconnect();
    // Edit mode swaps the mobile intro, so watch the new one.
  }, [overlap, project.id, scrollRootRef, editing]);

  return (
    <header
      className={cn(
        // The body below has a scrollbar; match its width so edges line up.
        "z-20 flex shrink-0 items-start gap-4 border-b pt-[22px] pb-1 max-sm:gap-2 max-sm:pt-1",
        "transition-[border-color] duration-200 motion-reduce:transition-none",
        // In the drawer, the edges line up with the project body's.
        embedded
          ? "px-4.5"
          : "pr-[calc(28px+var(--scrollbar-width,0px))] pl-7 max-sm:px-4.5 max-xs:px-3.5",
        compact ? "border-border" : "border-transparent",
        overlap
          ? [
              "pb-3.5 pointer-events-none [&>*]:pointer-events-auto",
              compact
                ? "bg-surface"
                : // No repeat: the tile is sized to the padding box, so it would
                  // otherwise repeat its opaque top into the transparent border.
                  "bg-[linear-gradient(var(--color-surface)_calc(100%-10px),transparent)] bg-no-repeat",
            ]
          : "bg-surface",
      )}
      data-compact={compact}
    >
      {edit ? (
        <EditField
          id="title"
          inline
          className={cn("min-w-0 flex-1 pb-1", embedded && "pt-1.5")}
        >
          {/* Same type as the heading, with the field's padding outside the text. */}
          <textarea
            className={cn(
              fieldControl,
              editState,
              "-mx-2.5 -my-1.5 field-sizing-content min-h-0 w-[calc(100%+20px)] resize-none rounded-lg px-[9px] py-[5px]",
              "text-[30px] leading-[1.16] font-semibold tracking-[-1px] max-sm:text-[24px] max-sm:tracking-[-0.65px]",
            )}
            aria-label="Prosjektnavn"
            maxLength={160}
            rows={1}
            value={edit.draft.title}
            onChange={(event) =>
              edit.change({ title: event.target.value.replace(/\n/g, " ") })
            }
            onKeyDown={(event) => {
              if (event.key === "Enter") event.preventDefault();
            }}
          />
        </EditField>
      ) : (
        <h1
          id="project-card-title"
          tabIndex={-1}
          className={cn(
            "m-0 min-w-0 flex-1 overflow-hidden text-[30px] leading-[1.16] font-semibold tracking-[-1px] text-ink outline-none max-sm:text-[24px] max-sm:tracking-[-0.65px]",
            embedded
              ? "line-clamp-2 pt-1.5 wrap-break-word"
              : "text-ellipsis whitespace-nowrap",
          )}
        >
          {project.title}
        </h1>
      )}
      {/* Offsets put the icon glyphs, not the hit areas, on the content edges. */}
      <div
        className={cn(
          "flex shrink-0 items-center",
          embedded
            ? "-mr-[15px] [&>button]:size-10"
            : "-mt-2.5 -mr-[17px] gap-0.5",
        )}
      >
        {!edit && (
          <>
            {actions}
            <span
              aria-hidden="true"
              className="mx-1.5 h-5 w-px shrink-0 bg-border"
            />
          </>
        )}
        <button
          type="button"
          data-project-close=""
          className={headerIconButton}
          onClick={onClose}
          aria-label="Lukk prosjekt"
        >
          <X size={20} />
        </button>
      </div>
    </header>
  );
}

export function ProjectPostHeaderDetails({
  project: current,
}: {
  project: Project;
}) {
  const edit = useProjectEdit();
  // While editing, the summary previews the draft.
  const project = edit ? finalize(edit.draft) : current;
  return (
    <div
      data-project-header-hero=""
      className="border-b border-border bg-surface px-7 pb-2 max-sm:px-4.5 max-xs:px-3.5"
    >
      <div className="flex min-h-11 flex-wrap items-center gap-x-4 gap-y-1.5 text-ui leading-normal text-muted max-md:gap-x-3 max-md:gap-y-1 max-md:pb-1 max-md:text-xs">
        <span className={metaItem}>
          <CategoryIcon category={project.category} size={14} />
          {project.category}
        </span>
        <span className={metaItem}>
          <MapPin size={14} aria-hidden="true" />
          {projectPlace(project)}
        </span>
        <span className={cn(metaItem, "font-medium text-ink")}>
          <i
            className={cn(
              "size-2 rounded-full",
              statusTone[project.status].dot,
            )}
          />
          {statuses[project.status].label}
        </span>
      </div>
    </div>
  );
}
