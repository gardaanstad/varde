"use client";
import { useLayoutEffect, useRef, type ReactNode } from "react";
import { LogIn } from "lucide-react";
import { cn } from "../lib/cn";
import { useSwipeDismiss } from "./use-swipe-dismiss";

const reduced = () =>
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Whether a sheet's trigger was reached by keyboard rather than a tap. */
export const openedByKeyboard = (trigger: Element | null) =>
  trigger instanceof HTMLElement && trigger.matches(":focus-visible");

export type SheetAction = {
  id: string;
  label: string;
  icon: ReactNode;
  onSelect: () => void;
  /** Greyed out for guests; choosing it asks them to log in. */
  locked?: boolean;
  pressed?: boolean;
  /** A switch: on or off, shown on the right. */
  checked?: boolean;
  /** A second line under the label. */
  detail?: string;
  /** On the right, such as a count. */
  trailing?: ReactNode;
  /** Starts a new group, divided from the actions above. */
  divided?: boolean;
};

/** The track and knob of an on/off switch, for a row that is one. */
export function SwitchTrack({ on }: { on: boolean }) {
  return (
    <span
      className={cn(
        "flex h-5 w-8.5 shrink-0 items-center rounded-full p-0.5 transition-colors duration-150 motion-reduce:transition-none",
        on ? "bg-accent" : "bg-border-strong",
      )}
      aria-hidden="true"
    >
      <span
        className={cn(
          "size-4 rounded-full bg-surface shadow-xs transition-transform duration-150 motion-reduce:transition-none",
          on && "translate-x-3.5",
        )}
      />
    </span>
  );
}

/**
 * Phones: a modal list of actions, named by `label` for screen readers along the bottom edge, like the filter
 * menus and the login prompt. A choice runs once the sheet has slid away,
 * so focus is back on the trigger first.
 */
export default function ActionSheet({
  label,
  actions,
  onClose,
}: {
  label: string;
  actions: SheetAction[];
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const sheet = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const trigger = useRef<Element | null>(null);
  const closing = useRef(false);

  useLayoutEffect(() => {
    const dialog = ref.current;
    trigger.current = document.activeElement;
    dialog?.showModal();
    // From the keyboard, focus goes to the first action; from a tap, to the
    // sheet itself, so no action looks chosen before one is.
    if (openedByKeyboard(trigger.current))
      dialog?.querySelector<HTMLElement>("[data-sheet-action]")?.focus();
    else dialog?.focus();
    return () => dialog?.close();
  }, []);

  // Swiped down, like the drawers; it has already slid away by then.
  useSwipeDismiss({
    enabled: true,
    sheet,
    scroller: list,
    onDismiss: () => close(undefined, false),
  });

  function close(then?: () => void, animate = true) {
    const dialog = ref.current;
    const panel = sheet.current;
    if (closing.current) return;
    closing.current = true;
    const done = () => {
      dialog?.close();
      const target = trigger.current;
      if (target instanceof HTMLElement && target.isConnected)
        target.focus({ preventScroll: true });
      onClose();
      then?.();
    };
    if (!dialog || !panel || !animate || reduced()) return done();
    const options = { duration: 200, easing: "ease-in", fill: "forwards" as const };
    const out = panel.animate(
      [{ transform: "none" }, { transform: "translateY(100%)" }],
      options,
    );
    dialog.animate([{ opacity: 1 }, { opacity: 0 }], {
      ...options,
      pseudoElement: "::backdrop",
    });
    out.finished.then(done, done);
  }

  return (
    <dialog
      ref={ref}
      aria-label={label}
      data-action-sheet=""
      // Its swipes are its own, not those of a drawer it opened from.
      data-base-ui-swipe-ignore=""
      tabIndex={-1}
      className={cn(
        "m-auto mb-0 w-full max-w-none overflow-visible border-0 bg-transparent p-0 text-ink outline-none",
        "backdrop:bg-scrim/25 motion-safe:backdrop:animate-backdrop-in",
      )}
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) close();
      }}
    >
      <div
        ref={sheet}
        className="rounded-t-sheet border-t border-border bg-surface px-2 pb-[calc(10px+env(safe-area-inset-bottom))] shadow-bar motion-safe:animate-sheet-in"
      >
        <div aria-hidden="true" className="flex justify-center pt-2 pb-3">
          <span className="h-1 w-9 rounded-full bg-ink/15" />
        </div>
        <ul ref={list} className="flex flex-col gap-0.5">
          {actions.map((action) => (
            <li
              key={action.id}
              className={cn(
                action.divided && "mt-1.5 border-t border-border pt-1.5",
              )}
            >
              <button
                type="button"
                data-sheet-action={action.id}
                data-locked={action.locked || undefined}
                aria-label={
                  action.locked
                    ? `${action.label}, krever innlogging`
                    : undefined
                }
                aria-pressed={action.pressed}
                role={action.checked !== undefined ? "switch" : undefined}
                aria-checked={action.checked}
                className={cn(
                  "flex min-h-12 w-full items-center gap-3 rounded-lg px-3 text-left text-body -outline-offset-2",
                  "transition-colors duration-150 active:bg-surface-muted motion-reduce:transition-none",
                  "[&>svg]:shrink-0 [&>svg]:text-muted",
                  action.locked && "text-muted [&>svg]:text-muted/60",
                )}
                onClick={() => close(action.onSelect)}
              >
                {action.icon}
                <span className="flex min-w-0 flex-1 flex-col">
                  {action.label}
                  {action.detail && (
                    <span className="text-xs text-muted">{action.detail}</span>
                  )}
                </span>
                {action.trailing}
                {action.checked !== undefined && (
                  <SwitchTrack on={action.checked} />
                )}
                {action.locked && <LogIn size={16} aria-hidden="true" />}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </dialog>
  );
}
