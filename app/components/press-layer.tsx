"use client";

import { useLayoutEffect } from "react";

/**
 * Controls marked `data-press` act when a mouse button goes down rather than
 * when it comes up, for actions that are easy to take back: opening a menu,
 * a project or a panel, or folding the sidebar. Touch keeps the click, so a
 * finger can still scroll past them, and so do the keyboard and modified
 * clicks (a link opened in a new tab).
 */
export default function PressLayer() {
  // Listening before hydration ends, so the first press already counts.
  useLayoutEffect(() => {
    // The click that ends a press that already acted.
    let swallow = false;
    let pressed: HTMLElement | null = null;
    function down(event: PointerEvent) {
      swallow = false;
      pressed = null;
      if (
        event.pointerType !== "mouse" ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey ||
        !(event.target instanceof Element)
      )
        return;
      const control = event.target.closest<HTMLElement>("[data-press]");
      if (!control || control.matches(":disabled, [aria-disabled=true]"))
        return;
      // Focus as the press would, before the action can move it on.
      control.focus({ preventScroll: true });
      control.click();
      swallow = true;
      pressed = control;
    }
    function mouseDown(event: MouseEvent) {
      // Keeps focus where the action put it, such as inside a menu.
      if (swallow && document.activeElement !== pressed) event.preventDefault();
    }
    function click(event: MouseEvent) {
      if (!swallow || event.detail === 0) return;
      swallow = false;
      event.preventDefault();
      event.stopPropagation();
    }
    window.addEventListener("pointerdown", down, true);
    window.addEventListener("mousedown", mouseDown, true);
    window.addEventListener("click", click, true);
    return () => {
      window.removeEventListener("pointerdown", down, true);
      window.removeEventListener("mousedown", mouseDown, true);
      window.removeEventListener("click", click, true);
    };
  }, []);
  return null;
}
