"use client";

import {
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import {
  Bookmark,
  Check,
  Ellipsis,
  MapPin,
  ChevronsRight,
  ChevronsLeft,
  Pencil,
  Share2,
  X,
} from "lucide-react";
import type { Project } from "../lib/data";
import { cn } from "../lib/cn";
import {
  fieldControl,
  iconButton,
  panelTitle,
  panelTitleTop,
} from "../lib/ui";
import ActionSheet, { type SheetAction } from "./action-sheet";
import {
  OverflowMenu,
  useHeaderOverflow,
  type OverflowAction,
} from "./header-overflow";
import { EditField, editState, useProjectEdit } from "./project-edit";

const headerIconButton = cn(
  iconButton,
  "rounded-lg max-md:size-10 active:scale-100 pointer-fine:active:scale-[0.97]",
);

const titleType = panelTitle;

/** Desktop: the width the title keeps before the actions give way to a menu. */
const titleReserve = 160;

// The full page's column: 1120px wide with 40px inside, centred beside the
// scrollbar (see `--scrollbar-width` in project-post.tsx). The title starts
// on its edge; icon glyphs, not hit areas, end on it.
const column = "(100% - var(--scrollbar-width, 0px) - 1120px) / 2 + 2.5rem";
const columnStart = `max(1.5rem, calc(${column}))`;
const columnEnd = `max(0.75rem, calc(${column} + var(--scrollbar-width, 0px) - 12px))`;

export type ProjectActionsProps = {
  /** Enters edit mode; members suggest their changes. */
  onEdit?: () => void;
  suggest?: boolean;
  copied: boolean;
  saved: boolean;
  onSave: () => void;
  onShare: () => void;
  /** Shows the project on the map, where the map is out of sight. */
  onMap?: () => void;
  /** Signed out: saving and suggesting ask to log in first. */
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

/**
 * Desktop: save, suggest a change and share, as icons in the bar beside the
 * panel's own controls. As the bar narrows they leave for a menu, share
 * first, so the title keeps its room.
 */
function DesktopActions({
  onEdit,
  suggest = false,
  copied,
  saved,
  onSave,
  onShare,
  hidden,
}: ProjectActionsProps & { hidden: Set<string> }) {
  const editLabel = suggest ? "Foreslå endring" : "Rediger prosjekt";
  const inline = (id: string, node: ReactNode) =>
    hidden.has(id) ? null : (
      <div className="flex shrink-0" data-overflow-item={id}>
        {node}
      </div>
    );
  const menu: OverflowAction[] = [
    {
      id: "save",
      label: saved ? "Lagret" : "Lagre",
      icon: <Bookmark size={16} />,
      checked: saved,
      onSelect: onSave,
    },
    ...(onEdit
      ? [
          {
            id: "edit",
            label: editLabel,
            icon: <Pencil size={16} />,
            onSelect: onEdit,
          },
        ]
      : []),
    {
      id: "share",
      label: copied ? "Lenke kopiert" : "Kopier lenke",
      icon: copied ? <Check size={16} /> : <Share2 size={16} />,
      onSelect: onShare,
    },
  ].filter((action) => hidden.has(action.id));
  return (
    <>
      {inline(
        "save",
        <button
          type="button"
          className={cn(headerIconButton, saved && "text-accent hover:text-accent")}
          onClick={onSave}
          data-save=""
          aria-label={saved ? "Lagret" : "Lagre"}
          aria-pressed={saved}
          data-tooltip={saved ? "Fjern fra lagrede" : "Lagre"}
        >
          <Bookmark size={18} fill={saved ? "currentColor" : "none"} />
        </button>,
      )}
      {onEdit &&
        inline(
          "edit",
          <button
            type="button"
            className={headerIconButton}
            aria-label={editLabel}
            data-tooltip={suggest ? "Foreslå endring" : "Rediger"}
            onClick={onEdit}
          >
            <Pencil size={18} />
          </button>,
        )}
      {inline(
        "share",
        <button
          type="button"
          className={cn(headerIconButton, copied && "text-accent hover:text-accent")}
          aria-label="Kopier lenke"
          data-tooltip={copied ? "Kopiert" : "Kopier lenke"}
          onClick={onShare}
          data-share=""
        >
          {copied ? <Check size={18} /> : <Share2 size={18} />}
        </button>,
      )}
      {menu.length > 0 && <OverflowMenu actions={menu} />}
      <span aria-hidden="true" className="mx-1.5 h-5 w-px shrink-0 bg-border" />
    </>
  );
}

/** Phones: one button opening a sheet with every action. */
function MobileActions({
  onEdit,
  suggest = false,
  copied,
  saved,
  onSave,
  onShare,
  onMap,
  guest = false,
}: ProjectActionsProps) {
  const [open, setOpen] = useState(false);
  const actions: SheetAction[] = [
    {
      id: "save",
      label: saved ? "Fjern fra lagrede" : "Lagre",
      icon: <Bookmark size={20} fill={saved ? "currentColor" : "none"} />,
      onSelect: onSave,
      locked: guest,
      pressed: saved,
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
        {saved && (
          <span
            aria-hidden="true"
            className="absolute top-2 right-2 size-2 rounded-full border-2 border-surface bg-accent"
          />
        )}
      </button>
      {open && (
        <ActionSheet
          label="Handlinger"
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
  const controlsRef = useRef<HTMLDivElement>(null);
  const overflow = useHeaderOverflow(
    controlsRef,
    mobile || edit
      ? []
      : ["share", ...(actions.onEdit ? ["edit"] : []), "save"],
    titleReserve,
  );

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
    <EditField
      id="title"
      inline
      className={cn(
        "min-w-0 flex-1 pb-1",
        mobile ? panelTitleTop.mobile : panelTitleTop.desktop,
      )}
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
        "m-0 line-clamp-2 min-w-0 flex-1 overflow-hidden text-ink outline-none wrap-break-word",
        // The first line level with the buttons beside it; see panelTitleTop.
        mobile ? panelTitleTop.mobile : panelTitleTop.desktop,
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
          {!edit && <MobileActions {...actions} />}
          {close}
        </div>
      </header>
    );

  // Desktop: a bar like every sidebar panel's, the mode and close controls
  // where the others have them, level with the title's first line, and the
  // project's own actions before them.
  return (
    <header
      className={cn("z-20 shrink-0 border-b bg-surface", border)}
      data-compact={compact}
    >
      <div
        // Controls centred 32px down, as on the list's header and every panel's.
        className="flex items-start gap-2 pt-2.5 pr-3 pb-1 pl-6"
        style={
          wide
            ? { paddingLeft: columnStart, paddingRight: columnEnd }
            : undefined
        }
      >
        {title}
        <div
          ref={controlsRef}
          className="flex shrink-0 items-center gap-0.5"
          data-project-actions=""
        >
          {!edit && <DesktopActions {...actions} hidden={overflow.hidden} />}
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
              {full ? <ChevronsLeft size={18} /> : <ChevronsRight size={18} />}
            </button>
          )}
          {close}
        </div>
      </div>
    </header>
  );
}
