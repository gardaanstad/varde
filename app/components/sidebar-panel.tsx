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

/**
 * Every sidebar change of size shares one transition: the timing of the
 * panels' slide (`--animate-panel-in`). Layers are clipped from the visible
 * width before to the one after. The layer in view also changes its width
 * when given `widths`, so its content moves along with the edge; layers
 * under it keep their widest size, so nothing lays out there per frame.
 */
export const sidebarTiming = {
  duration: 320,
  easing: "cubic-bezier(0.22, 1, 0.36, 1)",
};
export function animateVisibleWidth(
  element: HTMLElement,
  from: number,
  to: number,
  widths?: [from: number, to: number],
) {
  const frame = (visible: number, width?: number) => ({
    clipPath: `inset(0 ${Math.max(0, (width ?? element.offsetWidth) - visible)}px 0 0)`,
    ...(width !== undefined && { width: `${width}px` }),
  });
  // Held at the end until the layout settles, so the clip never lifts early.
  return element.animate([frame(from, widths?.[0]), frame(to, widths?.[1])], {
    ...sidebarTiming,
    fill: "forwards",
  });
}

/** How a closing panel leaves: sliding back out, or fading where it is. */
export function animatePanelOut(element: HTMLElement, fade: boolean) {
  const { transform, opacity } = getComputedStyle(element);
  return element.animate(
    fade
      ? [{ opacity }, { opacity: 0 }]
      : [{ transform }, { transform: "translateX(-100%)" }],
    {
      duration: fade ? 160 : 220,
      easing: fade ? "ease-out" : "cubic-bezier(0, 0, 0.6, 1)",
      fill: "forwards",
    },
  );
}

/** A panel opened again while closing returns from where it got to. */
export function animatePanelBack(element: HTMLElement, exit: Animation) {
  const { transform, opacity } = getComputedStyle(element);
  exit.cancel();
  return element.animate(
    [
      { transform, opacity },
      { transform: "none", opacity: 1 },
    ],
    sidebarTiming,
  );
}

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
 * Escape on the panel on top of the stack. Menus and dialogs over it take
 * Escape first.
 */
export function usePanelEscape(active: boolean, onEscape: () => void) {
  const onKey = useEffectEvent((event: KeyboardEvent) => {
    if (
      event.key !== "Escape" ||
      event.defaultPrevented ||
      document.querySelector("dialog[open], [data-slot=choice-menu][data-open=true]")
    )
      return;
    event.preventDefault();
    onEscape();
  });
  useEffect(() => {
    if (!active) return;
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active]);
}

/**
 * Desktop: a panel in the sidebar stack, a bar with the mode and close
 * controls over scrolling content. See `Panel`, which also handles Escape.
 */
export function SidebarPanel({
  name,
  maximized,
  onToggleMaximized,
  onClose,
  onBack,
  closeLabel = "Lukk",
  children,
}: {
  /** Names the panel for tests and styling (`data-sidebar-panel`). */
  name: string;
  maximized: boolean;
  onToggleMaximized: () => void;
  onClose: () => void;
  /** Back to the panel this one was opened from. */
  onBack?: () => void;
  closeLabel?: string;
  children: ReactNode;
}) {
  return (
    <div
      className="flex h-full min-h-0 flex-col bg-surface"
      data-sidebar-panel={name}
    >
      <div
        className={cn(
          // The list's header height, so controls stay put as panels open.
          "flex h-16 shrink-0 items-center gap-0.5 px-3",
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
