"use client";

import { useEffect, useState, type RefObject } from "react";
import {
  Bell,
  BellRing,
  Check,
  Ellipsis,
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
import ActionSheet, { type SheetAction } from "./action-sheet";
import { EditField, editState, useProjectEdit } from "./project-edit";

const headerIconButton = cn(
  iconButton,
  "size-10 rounded-lg active:scale-100 active:text-accent pointer-fine:active:scale-[0.97]",
);

/** Desktop: the project's own actions, outlined pills with a label. */
const actionPill = cn(
  "inline-flex h-8.5 shrink-0 items-center gap-1.5 rounded-full border border-border-strong px-3 text-xs font-semibold text-ink",
  "transition-[color,background-color,border-color] duration-150 hover:bg-surface-muted motion-reduce:transition-none",
  "[&>svg]:shrink-0",
);

const titleType =
  "text-[24px] leading-[1.16] font-semibold tracking-[-0.65px] md:text-[26px] md:tracking-[-0.8px]";

// The full page's column: 1120px wide with 40px inside, centred beside the
// scrollbar (see `--scrollbar-width` in project-post.tsx). The bar's pills
// start on its edge; icon glyphs, not hit areas, end on it.
const column = "(100% - var(--scrollbar-width, 0px) - 1120px) / 2 + 2.5rem";
const columnStart = `max(1.5rem, calc(${column}))`;
const columnEnd = `max(0.75rem, calc(${column} + var(--scrollbar-width, 0px) - 10px))`;

export type ProjectActionsProps = {
  /** Enters edit mode; members suggest their changes. */
  onEdit?: () => void;
  suggest?: boolean;
  copied: boolean;
  following: boolean;
  onFollow: () => void;
  onShare: () => void;
  /** Shows the project on the map, where the map is out of sight. */
  onMap?: () => void;
  /** Signed out: following and suggesting ask to log in first. */
  guest?: boolean;
};

type HeaderProps = {
  project: Project;
  actions: ProjectActionsProps;
  scrollRootRef: RefObject<HTMLDivElement | null>;
  onClose: () => void;
  /** Lines the bar up with the full page's centred column. */
  wide?: boolean;
  /** Desktop: switches between the sidebar and a full page. */
  full?: boolean;
  onToggleFull?: () => void;
  /** Phones: the actions gather in a sheet behind one button. */
  mobile?: boolean;
};

/** Desktop: follow, suggest a change and share, each with its label. */
function DesktopActions({
  onEdit,
  suggest = false,
  copied,
  following,
  onFollow,
  onShare,
}: ProjectActionsProps) {
  return (
    <div className="flex min-w-0 items-center gap-1.5" data-project-actions="">
      <button
        type="button"
        className={cn(
          actionPill,
          following &&
            "border-transparent bg-accent-soft text-accent-strong hover:bg-accent/16",
        )}
        onClick={onFollow}
        data-follow=""
        aria-pressed={following}
        data-tooltip={following ? "Slutt å følge" : undefined}
      >
        {following ? (
          <BellRing size={14} aria-hidden="true" />
        ) : (
          <Bell size={14} aria-hidden="true" />
        )}
        {following ? "Følger" : "Følg"}
      </button>
      {onEdit && (
        <button
          type="button"
          className={cn(actionPill, "@max-[430px]:size-8.5 @max-[430px]:justify-center @max-[430px]:px-0")}
          aria-label={suggest ? "Foreslå endring" : "Rediger prosjekt"}
          data-tooltip={suggest ? "Foreslå endring" : "Rediger"}
          onClick={onEdit}
        >
          <Pencil size={14} aria-hidden="true" />
          <span className="@max-[430px]:sr-only">
            {suggest ? "Foreslå endring" : "Rediger"}
          </span>
        </button>
      )}
      <button
        type="button"
        className={cn(actionPill, copied && "text-accent-strong")}
        onClick={onShare}
        data-tooltip={copied ? undefined : "Kopier lenke"}
        data-share=""
      >
        {copied ? (
          <Check size={14} aria-hidden="true" />
        ) : (
          <Share2 size={14} aria-hidden="true" />
        )}
        {copied ? "Kopiert" : "Del"}
      </button>
    </div>
  );
}

/** Phones: one button opening a sheet with every action. */
function MobileActions({
  title,
  onEdit,
  suggest = false,
  copied,
  following,
  onFollow,
  onShare,
  onMap,
  guest = false,
}: ProjectActionsProps & { title: string }) {
  const [open, setOpen] = useState(false);
  const actions: SheetAction[] = [
    {
      id: "follow",
      label: following ? "Slutt å følge" : "Følg",
      icon: following ? <BellRing size={20} /> : <Bell size={20} />,
      onSelect: onFollow,
      locked: guest,
      pressed: following,
    },
    ...(onEdit
      ? [
          {
            id: "edit",
            label: suggest ? "Foreslå endring" : "Rediger prosjekt",
            icon: <Pencil size={20} />,
            onSelect: onEdit,
            locked: guest && suggest,
          },
        ]
      : []),
    {
      id: "share",
      label: copied ? "Lenke kopiert" : "Kopier lenke",
      icon: copied ? <Check size={20} /> : <Share2 size={20} />,
      onSelect: onShare,
    },
    ...(onMap
      ? [
          {
            id: "map",
            label: "Vis i kartet",
            icon: <MapPin size={20} />,
            onSelect: onMap,
          },
        ]
      : []),
  ];
  return (
    <>
      <button
        type="button"
        className={cn(headerIconButton, "relative text-muted")}
        aria-label="Handlinger"
        aria-haspopup="dialog"
        aria-expanded={open}
        data-project-menu=""
        onClick={() => setOpen(true)}
      >
        <Ellipsis size={20} />
        {following && (
          <span
            aria-hidden="true"
            className="absolute top-2 right-2 size-2 rounded-full border-2 border-surface bg-accent"
          />
        )}
      </button>
      {open && (
        <ActionSheet
          label={title}
          actions={actions}
          onClose={() => setOpen(false)}
        />
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
  mobile = false,
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

  const title = edit ? (
    <EditField id="title" inline className="min-w-0 flex-1 pt-1.5 pb-1">
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
  );
  const close = (
    <button
      type="button"
      data-project-close=""
      className={headerIconButton}
      onClick={onClose}
      aria-label="Lukk prosjekt"
    >
      <X size={20} />
    </button>
  );
  const border = cn(
    "transition-[border-color] duration-200 motion-reduce:transition-none",
    compact ? "border-border" : "border-transparent",
  );

  if (mobile)
    return (
      <header
        className={cn(
          "z-20 flex shrink-0 items-start gap-2 border-b bg-surface px-4.5 pt-1 pb-1",
          border,
        )}
        data-compact={compact}
      >
        {title}
        {/* Offsets put the icon glyphs, not the hit areas, on the content edges. */}
        <div className="-mr-[15px] flex shrink-0 items-center">
          {!edit && <MobileActions {...actions} title={project.title} />}
          {close}
        </div>
      </header>
    );

  // Desktop: a bar like every sidebar panel's, the project's actions at its
  // start and the panel's mode and close controls where the others have them.
  return (
    <header
      className={cn("@container z-20 shrink-0 border-b bg-surface", border)}
      data-compact={compact}
    >
      <div
        className="flex h-14 items-center gap-2 pr-3 pl-6"
        style={
          wide
            ? { paddingLeft: columnStart, paddingRight: columnEnd }
            : undefined
        }
      >
        {!edit && <DesktopActions {...actions} />}
        <div className="ml-auto flex shrink-0 items-center gap-0.5">
          {onToggleFull && (
            <button
              type="button"
              className={headerIconButton}
              onClick={onToggleFull}
              aria-label={full ? "Vis i sidepanel" : "Vis som helside"}
              data-tooltip={full ? "Vis i sidepanel" : "Vis som helside"}
              data-project-full=""
              data-sidebar-maximize=""
            >
              {full ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
            </button>
          )}
          {close}
        </div>
      </div>
      <div
        className="flex px-6 pb-2"
        style={
          wide
            ? { paddingLeft: columnStart, paddingRight: columnStart }
            : undefined
        }
      >
        {title}
      </div>
    </header>
  );
}
