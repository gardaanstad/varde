"use client";

import { useEffect, useEffectEvent, type RefObject } from "react";

/*
 * The drawers' swipe rules (Base UI 1.8's DrawerViewport and useSwipeDismiss,
 * which it doesn't export), so sheets of our own close the same way:
 */
/** Movement before a press becomes a drag, rather than a tap. */
const startDistance = 10;
/** Dragged past half its height, a sheet closes on release… */
const closeFraction = 0.5;
/** …or flung down at this speed, in pixels per millisecond. */
const closeVelocity = 0.5;
/** Velocity over the whole drag counts at least this long. */
const minVelocityMs = 50;
/** The release velocity is read from the last moments of the drag. */
const releaseWindowMs = 80;
const minReleaseMs = 16;
/** A flung sheet leaves in time with its speed, as the drawers do. */
const minReleaseVelocity = 0.2;
const maxReleaseVelocity = 4;
const minLeaveMs = 80;
const maxLeaveMs = 360;
const minLeaveScale = 0.1;
const leaveMs = 400;
/** Springing back: the drawers' own transition. */
const settle = "450ms cubic-bezier(0.22, 1, 0.36, 1)";

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));
const reduced = () =>
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * Drags a bottom sheet down by touch, from anywhere on it. Inside its list a
 * drag waits until the list is at its top, so one gesture can scroll back up
 * and carry on into closing it. Never moves it up; sideways moves and taps
 * pass through. `--sheet-progress` (0 to 1) on `backdrop` follows the drag,
 * for its scrim.
 */
export function useSwipeDismiss({
  enabled,
  sheet,
  scroller,
  backdrop,
  onDismiss,
}: {
  enabled: boolean;
  sheet: RefObject<HTMLElement | null>;
  scroller: RefObject<HTMLElement | null>;
  backdrop?: RefObject<HTMLElement | null>;
  onDismiss: () => void;
}) {
  const dismiss = useEffectEvent(onDismiss);
  useEffect(() => {
    const panel = sheet.current;
    if (!enabled || !panel) return;
    const scrim = backdrop?.current;
    let start: { x: number; y: number; t: number } | null = null;
    let axis: "x" | "y" | null = null;
    let lastY = 0;
    // Where the finger was when the sheet began to follow it.
    let origin: { y: number; t: number } | null = null;
    let offset = 0;
    let samples: { y: number; t: number }[] = [];
    let leaving = false;

    const place = (value: number, transition = "none") => {
      offset = value;
      panel.style.transition = transition === "none" ? "" : `translate ${transition}`;
      panel.style.translate = value ? `0 ${value}px` : "";
      if (scrim) {
        scrim.style.transition =
          transition === "none" ? "" : `--sheet-progress ${transition}`;
        scrim.style.setProperty(
          "--sheet-progress",
          String(clamp(value / (panel.offsetHeight || 1), 0, 1)),
        );
      }
    };
    const reset = () => {
      panel.style.removeProperty("translate");
      panel.style.removeProperty("transition");
      scrim?.style.removeProperty("--sheet-progress");
      scrim?.style.removeProperty("transition");
    };

    const onStart = (event: TouchEvent) => {
      if (leaving || event.touches.length !== 1) {
        start = null;
        return;
      }
      const touch = event.touches[0];
      start = { x: touch.clientX, y: touch.clientY, t: event.timeStamp };
      axis = null;
      lastY = touch.clientY;
      origin = null;
      samples = [];
      if (offset) place(offset);
    };

    const onMove = (event: TouchEvent) => {
      if (!start || event.touches.length !== 1) return;
      const touch = event.touches[0];
      const y = touch.clientY;
      const step = y - lastY;
      lastY = y;
      if (!axis) {
        const dx = Math.abs(touch.clientX - start.x);
        const dy = Math.abs(y - start.y);
        if (Math.max(dx, dy) < startDistance) return;
        axis = dx > dy ? "x" : "y";
      }
      if (axis === "x") return;
      const list = scroller.current;
      // A handle (`data-swipe-handle`, with `touch-action: none`) inside the
      // list drags the sheet wherever the list is scrolled to.
      const target = event.target as Element;
      const inList =
        !!list && list.contains(target) && !target.closest("[data-swipe-handle]");
      if (!origin) {
        // Only down, and only once the list under the finger is at its top.
        const atTop = !inList || list.scrollTop <= 0;
        if (step <= 0 || !atTop) return;
        origin = { y: y - step, t: event.timeStamp };
        samples = [];
      }
      const next = Math.max(0, y - origin.y);
      if (event.cancelable) event.preventDefault();
      samples.push({ y, t: event.timeStamp });
      samples = samples.filter(
        (sample) => event.timeStamp - sample.t <= releaseWindowMs,
      );
      place(next);
      // Back at the top and still going up: the list scrolls again.
      if (next === 0 && step < 0) origin = null;
    };

    const onEnd = (event: TouchEvent) => {
      if (!start) return;
      const began = origin;
      start = null;
      origin = null;
      if (!began || offset <= 0) {
        if (offset) place(0, reduced() ? "none" : settle);
        return;
      }
      const height = panel.offsetHeight;
      const overall =
        offset / Math.max(event.timeStamp - began.t, minVelocityMs);
      const first = samples[0];
      const last = samples[samples.length - 1];
      const recent =
        first && last && last.t - first.t >= minReleaseMs
          ? (last.y - first.y) / (last.t - first.t)
          : 0;
      const velocity = recent || overall;
      const closes =
        overall >= closeVelocity ||
        offset > Math.max(height * closeFraction, startDistance);
      if (!closes) {
        place(0, reduced() ? "none" : settle);
        return;
      }
      leaving = true;
      const finish = () => {
        leaving = false;
        offset = 0;
        dismiss();
        // The sheet is gone by the next frame; it opens again from rest.
        requestAnimationFrame(reset);
      };
      if (reduced()) return finish();
      const remaining = Math.max(0, height - offset);
      const speed = clamp(velocity, minReleaseVelocity, maxReleaseVelocity);
      const duration = clamp(remaining / speed, minLeaveMs, maxLeaveMs);
      const scale =
        minLeaveScale +
        ((duration - minLeaveMs) / (maxLeaveMs - minLeaveMs)) *
          (1 - minLeaveScale);
      const ms = Math.round(scale * leaveMs);
      place(height, `${ms}ms ease-out`);
      window.setTimeout(finish, ms);
    };

    panel.addEventListener("touchstart", onStart, { passive: true });
    panel.addEventListener("touchmove", onMove, { passive: false });
    panel.addEventListener("touchend", onEnd);
    panel.addEventListener("touchcancel", onEnd);
    return () => {
      panel.removeEventListener("touchstart", onStart);
      panel.removeEventListener("touchmove", onMove);
      panel.removeEventListener("touchend", onEnd);
      panel.removeEventListener("touchcancel", onEnd);
      reset();
    };
  }, [enabled, sheet, scroller, backdrop]);
}
