"use client";
import { type RefObject, useEffect, useRef, useState } from "react";
import { cn } from "../lib/cn";

const storageKey = "varde-panel-width";
const minWidth = 280;
const maxWidth = 760;
// The map keeps at least this much of the window.
const minMap = 360;
const keyStep = 16;
const largeKeyStep = 64;

/** The width the panel has before anyone resizes it: 36% of the window. */
function defaultWidth() {
  return Math.round(Math.min(Math.max(window.innerWidth * 0.36, 380), 540));
}
/** `fits`: the narrowest the panel's content allows, which raises the floor. */
function bounds(fits = 0) {
  const min = Math.max(minWidth, Math.ceil(fits));
  const max = Math.max(min, Math.min(maxWidth, window.innerWidth - minMap));
  return { min, max };
}
function clamp(width: number, fits?: number) {
  const { min, max } = bounds(fits);
  return Math.round(Math.min(Math.max(width, min), max));
}
function storedWidth() {
  try {
    const stored = Number(localStorage.getItem(storageKey));
    return Number.isFinite(stored) && stored > 0 ? stored : null;
  } catch {
    return null;
  }
}
function storeWidth(width: number | null) {
  try {
    if (width === null) localStorage.removeItem(storageKey);
    else localStorage.setItem(storageKey, String(width));
  } catch {
    /* The width just isn't remembered. */
  }
}

/**
 * The divider between the desktop list and the map. Dragging writes the
 * width to `--panel-width` on `panel` once per frame, without re-rendering;
 * React only hears the final width. Arrow keys, Home and End resize too, and
 * a double click returns to the default width.
 */
export default function PanelResizer({
  panel,
  root,
  controls,
  onResizeStart,
  onResize,
  onResizeEnd,
  contentWidth,
  naturalWidth,
  contentRef,
}: {
  panel: RefObject<HTMLElement | null>;
  /** Marked with `data-resizing` while dragging, for cursor and selection. */
  root: RefObject<HTMLElement | null>;
  /** The panel's id. */
  controls: string;
  onResizeStart?: () => void;
  /** Once per frame while the width changes. */
  onResize?: () => void;
  onResizeEnd?: () => void;
  /** The narrowest the panel's content fits in; it is never made narrower. */
  contentWidth?: () => number;
  /** The width the content fits in whole; the default width is at least it. */
  naturalWidth?: () => number;
  /** Changes to the elements whose size sets `contentWidth`. */
  contentRef?: RefObject<HTMLElement | null>;
}) {
  const handle = useRef<HTMLDivElement>(null);
  // Only for the ARIA values; the width itself lives in the CSS variable.
  const [width, setWidth] = useState<number | null>(null);
  const [range, setRange] = useState({ min: minWidth, max: maxWidth });
  const frame = useRef(0);
  const drag = useRef<{ start: number; from: number; to: number } | null>(
    null,
  );

  const initialWidth = () =>
    Math.max(defaultWidth(), Math.ceil(naturalWidth?.() ?? 0));
  function apply(next: number) {
    panel.current?.style.setProperty("--panel-width", `${next}px`);
    handle.current?.setAttribute("aria-valuenow", String(next));
  }
  /** Applies a width outside a drag: clamped, remembered, map in sync. */
  function commit(next: number | null) {
    const value = clamp(next ?? initialWidth(), contentWidth?.());
    onResizeStart?.();
    apply(value);
    onResizeEnd?.();
    setWidth(value);
    storeWidth(next === null ? null : value);
  }

  // The stored width, then again whenever the window or content changes size.
  useEffect(() => {
    let last: number | null = null;
    const fit = () => {
      const fits = contentWidth?.();
      setRange(bounds(fits));
      const value = clamp(storedWidth() ?? initialWidth(), fits);
      if (value === last) return;
      last = value;
      onResizeStart?.();
      apply(value);
      onResizeEnd?.();
      setWidth(value);
    };
    fit();
    window.addEventListener("resize", fit);
    const content = contentRef?.current;
    const observer = content ? new ResizeObserver(() => fit()) : null;
    if (content) observer?.observe(content);
    return () => {
      window.removeEventListener("resize", fit);
      observer?.disconnect();
      cancelAnimationFrame(frame.current);
    };
    // Mount only; `apply` reads refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function end(event: React.PointerEvent) {
    const current = drag.current;
    if (!current) return;
    drag.current = null;
    cancelAnimationFrame(frame.current);
    frame.current = 0;
    handle.current?.releasePointerCapture?.(event.pointerId);
    root.current?.removeAttribute("data-resizing");
    apply(current.to);
    onResizeEnd?.();
    setWidth(current.to);
    storeWidth(current.to);
  }

  return (
    <div
      ref={handle}
      role="separator"
      aria-orientation="vertical"
      aria-label="Bredde på prosjektlisten"
      aria-controls={controls}
      aria-valuemin={range.min}
      aria-valuemax={range.max}
      aria-valuenow={width ?? undefined}
      tabIndex={0}
      data-panel-resizer=""
      className={cn(
        "group/resizer absolute inset-y-0 -right-1.5 z-30 flex w-3 cursor-col-resize touch-none justify-center outline-none",
        // A hairline that thickens on hover, focus and drag.
        "before:h-full before:w-0.5 before:bg-transparent before:transition-colors before:duration-150",
        "hover:before:bg-accent/45 focus-visible:before:w-[3px] focus-visible:before:bg-accent",
        "[[data-resizing]_&]:before:bg-accent",
      )}
      onPointerDown={(event) => {
        if (event.button !== 0 || !panel.current) return;
        event.preventDefault();
        event.currentTarget.setPointerCapture(event.pointerId);
        const from = panel.current.getBoundingClientRect().width;
        drag.current = { start: event.clientX, from, to: Math.round(from) };
        root.current?.setAttribute("data-resizing", "");
        onResizeStart?.();
      }}
      onPointerMove={(event) => {
        const current = drag.current;
        if (!current) return;
        current.to = clamp(
          current.from + event.clientX - current.start,
          contentWidth?.(),
        );
        // Many pointer events per frame; one style write and map sync.
        frame.current ||= requestAnimationFrame(() => {
          frame.current = 0;
          if (!drag.current) return;
          apply(drag.current.to);
          onResize?.();
        });
      }}
      onPointerUp={end}
      onPointerCancel={end}
      onLostPointerCapture={end}
      onDoubleClick={() => commit(null)}
      onKeyDown={(event) => {
        const current =
          width ?? panel.current?.getBoundingClientRect().width ?? 0;
        const step = event.shiftKey ? largeKeyStep : keyStep;
        const next =
          event.key === "ArrowLeft"
            ? current - step
            : event.key === "ArrowRight"
              ? current + step
              : event.key === "Home"
                ? range.min
                : event.key === "End"
                  ? range.max
                  : undefined;
        if (next === undefined) return;
        event.preventDefault();
        commit(next);
      }}
    />
  );
}
