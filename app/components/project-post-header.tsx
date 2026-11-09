"use client";

import { useEffect, useState, type ReactNode, type RefObject } from "react";
import {
  Bookmark,
  Check,
  MapPin,
  Maximize2,
  Minimize2,
  Pencil,
  Share2,
  X,
} from "lucide-react";
import type { Project } from "../lib/data";
import { cn } from "../lib/cn";
import { fieldControl, iconButton } from "../lib/ui";
import { EditField, editState, useProjectEdit } from "./project-edit";

const headerIconButton = cn(
  iconButton,
  "rounded-lg active:scale-100 active:text-accent pointer-fine:active:scale-[0.97]",
);

const titleType =
  "text-[24px] leading-[1.16] font-semibold tracking-[-0.65px] md:text-[26px] md:tracking-[-0.8px]";

type HeaderProps = {
  project: Project;
  /** Shown before the close button, hidden while editing. */
  actions: ReactNode;
  scrollRootRef: RefObject<HTMLDivElement | null>;
  onClose: () => void;
  /** Lines the bar up with the full page's centred column. */
  wide?: boolean;
  /** Desktop: switches between the sidebar and a full page. */
  full?: boolean;
  onToggleFull?: () => void;
};

type ProjectActionsProps = {
  /** Enters edit mode; moderators only. */
  onEdit?: () => void;
  copied: boolean;
  saved: boolean;
  onSave: () => void;
  onShare: () => void;
  /** Shows the project on the map, where the map is out of sight. */
  onMap?: () => void;
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
      {onMap && (
        <button
          type="button"
          className={headerIconButton}
          onClick={onMap}
          data-tooltip="Vis i kartet"
          aria-label="Vis i kartet"
        >
          <MapPin size={18} />
        </button>
      )}
    </>
  );
}

export default function ProjectPostHeader({
  project,
  actions,
  scrollRootRef,
  onClose,
  wide = false,
  full = false,
  onToggleFull,
}: HeaderProps) {
  const [compact, setCompact] = useState(false);
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
      { root, threshold: 0 },
    );

    observer.observe(details);
    return () => observer.disconnect();
    // Edit mode and the full page swap the intro, so watch the new one.
  }, [project.id, scrollRootRef, editing, wide]);

  return (
    <header
      className={cn(
        "z-20 flex shrink-0 items-start gap-2 border-b bg-surface px-4.5 pt-1 pb-1 md:gap-3 md:px-6 md:pt-3",
        // The body's column: 1120px wide with 40px inside, centred.
        wide &&
          "md:px-[max(2.5rem,calc((100%-1120px)/2+2.5rem))] md:pt-5",
        "transition-[border-color] duration-200 motion-reduce:transition-none",
        compact ? "border-border" : "border-transparent",
      )}
      data-compact={compact}
    >
      {edit ? (
        <EditField
          id="title"
          inline
          className="min-w-0 flex-1 pt-1.5 pb-1"
        >
          {/* Same type as the heading, with the field's padding outside the text. */}
          <textarea
            className={cn(
              fieldControl,
              editState,
              "-mx-2.5 -my-1.5 field-sizing-content min-h-0 w-[calc(100%+20px)] resize-none rounded-lg px-[9px] py-[5px]",
              titleType,
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
            "m-0 line-clamp-2 min-w-0 flex-1 overflow-hidden pt-1.5 text-ink outline-none wrap-break-word",
            titleType,
          )}
        >
          {project.title}
        </h1>
      )}
      {/* Offsets put the icon glyphs, not the hit areas, on the content edges. */}
      <div
        className="-mr-[15px] flex shrink-0 items-center [&>button]:size-10"
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
        {onToggleFull && (
          <button
            type="button"
            className={headerIconButton}
            onClick={onToggleFull}
            aria-label={full ? "Vis i sidepanel" : "Vis som helside"}
            data-tooltip={full ? "Vis i sidepanel" : "Vis som helside"}
            data-project-full=""
          >
            {full ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
          </button>
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
