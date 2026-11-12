"use client";
import { type ReactNode, useEffect, useRef } from "react";
import { X } from "lucide-react";
import { cn } from "../lib/cn";


const dialogStyles = [
  "relative m-auto max-h-[90dvh] w-[480px] max-w-[calc(100vw-32px)]",
  "overflow-y-auto overscroll-contain rounded-[18px] border border-border bg-surface p-0 text-ink",
  "shadow-dialog scrollbar-thin",
  "motion-safe:animate-dialog-enter",
  "backdrop:bg-scrim/33 backdrop:backdrop-blur-[4px]",
  "max-sm:max-h-[calc(100dvh-32px)] max-sm:w-full max-sm:max-w-[calc(100vw-20px)] max-sm:rounded-2xl",
].join(" ");

const closeButtonStyles = cn(
  "absolute top-[17px] right-[17px] z-10 inline-flex size-11 items-center justify-center",
  "rounded-xl border-0 bg-transparent p-0 text-muted",
  "transition-[color,background-color,transform] duration-150",
  "hover:bg-ink/[0.06] hover:text-ink",
  "active:scale-[0.97] motion-reduce:transition-none motion-reduce:active:scale-100",
  "max-sm:top-3 max-sm:right-3",
);

/** Whether a pointer event landed outside the dialog box, on its backdrop. */
function onBackdrop(event: React.MouseEvent<HTMLDialogElement>) {
  const rect = event.currentTarget.getBoundingClientRect();
  return (
    event.target === event.currentTarget &&
    (event.clientX < rect.left ||
      event.clientX > rect.right ||
      event.clientY < rect.top ||
      event.clientY > rect.bottom)
  );
}

export default function Dialog({
  children,
  onClose,
  title,
  className = "",
  initialFocusSelector,
  returnFocusSelector,
  closeButton = true,
}: {
  children: ReactNode;
  onClose: () => void;
  title: string;
  className?: string;
  initialFocusSelector?: string;
  returnFocusSelector?: string;
  /** Off when the content brings its own close button. */
  closeButton?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const triggerRef = useRef<Element | null>(null);
  const backdropPointer = useRef(false);
  useEffect(() => {
    const dialog = ref.current;
    triggerRef.current ??= document.activeElement;
    const trigger = triggerRef.current;
    const projectId = trigger?.getAttribute("data-project-id");
    dialog?.showModal();
    if (initialFocusSelector)
      dialog
        ?.querySelector<HTMLElement>(initialFocusSelector)
        ?.focus({ preventScroll: true });
    const old = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = old;
      dialog?.close();
      requestAnimationFrame(() => {
        if (document.querySelector("dialog[open]")) return;
        const target =
          trigger?.isConnected && trigger !== document.body
            ? trigger
            : (projectId &&
                document.querySelector(
                  `[data-project-id="${CSS.escape(projectId)}"]`,
                )) ||
              (returnFocusSelector &&
                document.querySelector(returnFocusSelector));
        if (target instanceof HTMLElement || target instanceof SVGElement)
          target.focus({ preventScroll: true });
      });
    };
  }, [initialFocusSelector, returnFocusSelector]);
  return (
    <dialog
      ref={ref}
      className={cn(dialogStyles, className)}
      aria-label={title}
      aria-modal="true"
      onKeyDown={(event) => {
        if (event.key !== "Tab") return;
        const items = Array.from(
          event.currentTarget.querySelectorAll<HTMLElement>(
            "button, a[href], input, select, textarea, [tabindex]",
          ),
        ).filter(
          (item) =>
            item.tabIndex >= 0 &&
            !item.matches(":disabled") &&
            item.getClientRects().length > 0,
        );
        const first = items[0];
        const last = items[items.length - 1];
        if (
          event.shiftKey &&
          (document.activeElement === first ||
            !items.includes(document.activeElement as HTMLElement))
        ) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }}
      // Only a press and release both on the backdrop closes the dialog.
      onPointerDown={(event) => {
        backdropPointer.current = onBackdrop(event);
      }}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (backdropPointer.current && onBackdrop(event)) onClose();
      }}
    >
      {closeButton && (
        <button
          type="button"
          className={closeButtonStyles}
          aria-label="Lukk"
          onClick={onClose}
        >
          <X size={20} />
        </button>
      )}
      {children}
    </dialog>
  );
}
