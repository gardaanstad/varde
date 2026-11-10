"use client";

import { useEffect, useEffectEvent, type ReactNode } from "react";
import { ArrowLeft, Maximize2, Minimize2, X } from "lucide-react";
import { cn } from "../lib/cn";
import { iconButton } from "../lib/ui";

/**
 * Desktop: how the sidebar sits beside the map. The explorer list is its
 * base layer; panels (a project, Følger, Forslag, a profile) stack on top
 * and share the mode. A collapsed sidebar still shows panels at normal width.
 */
export type SidebarMode = "collapsed" | "normal" | "maximized";

const controlButton = cn(
  iconButton,
  "rounded-lg active:scale-100 active:text-accent pointer-fine:active:scale-[0.97]",
);

/** Switches the sidebar between its normal width and the whole window. */
export function MaximizeButton({
  maximized,
  onToggle,
  labels = ["Vis som helside", "Vis i sidepanel"],
}: {
  maximized: boolean;
  onToggle: () => void;
  /** Maximize and minimize labels. */
  labels?: [string, string];
}) {
  const label = maximized ? labels[1] : labels[0];
  return (
    <button
      type="button"
      className={controlButton}
      onClick={onToggle}
      aria-label={label}
      data-tooltip={label}
      data-sidebar-maximize=""
    >
      {maximized ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
    </button>
  );
}

/**
 * A panel in the sidebar stack: a bar with the mode and close controls over
 * scrolling content. Escape steps down from a maximized panel before closing.
 */
export function SidebarPanel({
  name,
  maximized,
  active,
  onToggleMaximized,
  onClose,
  onBack,
  closeLabel = "Lukk",
  children,
}: {
  /** Names the panel for tests and styling (`data-sidebar-panel`). */
  name: string;
  maximized: boolean;
  /** The top of the stack: the one Escape acts on. */
  active: boolean;
  onToggleMaximized: () => void;
  onClose: () => void;
  /** Back to the panel this one was opened from. */
  onBack?: () => void;
  closeLabel?: string;
  children: ReactNode;
}) {
  const onKey = useEffectEvent((event: KeyboardEvent) => {
    if (
      event.key !== "Escape" ||
      event.defaultPrevented ||
      document.querySelector("dialog[open], [data-slot=choice-menu][data-open=true]")
    )
      return;
    event.preventDefault();
    if (maximized) onToggleMaximized();
    else onClose();
  });
  useEffect(() => {
    if (!active) return;
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active]);

  return (
    <div
      className="flex h-full min-h-0 flex-col bg-surface"
      data-sidebar-panel={name}
    >
      <div
        className={cn(
          "flex h-14 shrink-0 items-center gap-0.5 px-3",
          maximized && "px-[max(0.75rem,calc((100%-880px)/2))]",
        )}
      >
        {onBack && (
          <button
            type="button"
            className={cn(controlButton, "text-muted")}
            onClick={onBack}
            aria-label="Tilbake"
            data-tooltip="Tilbake"
          >
            <ArrowLeft size={19} />
          </button>
        )}
        <div className="ml-auto flex items-center gap-0.5">
          <MaximizeButton maximized={maximized} onToggle={onToggleMaximized} />
          <button
            type="button"
            className={controlButton}
            onClick={onClose}
            aria-label={closeLabel}
            data-sidebar-close=""
          >
            <X size={20} />
          </button>
        </div>
      </div>
      <div
        className={cn(
          "flex min-h-0 flex-1 flex-col",
          maximized && "mx-auto w-full max-w-[880px]",
        )}
      >
        {children}
      </div>
    </div>
  );
}
