"use client";
import { useCallback, useSyncExternalStore } from "react";
import { Toast } from "@base-ui/react/toast";
import { Check, CircleAlert, X } from "lucide-react";
import { cn } from "../lib/cn";

const manager = Toast.createToastManager();

/** Phones get toasts at the top, clear of the drawer and bottom sheets. */
const topQuery = "(width < 48rem)";

type Options = {
  /** Offers "Angre"; the toast closes as it runs. */
  undo?: () => void;
  error?: boolean;
};

/** Shows a short confirmation, or an error, from anywhere on the client. */
export function notify(message: string, { undo, error }: Options = {}) {
  const id: string = manager.add({
    title: message,
    type: error ? "error" : "success",
    timeout: undo ? 8000 : error ? 7000 : 5000,
    actionProps: undo && {
      children: "Angre",
      onClick: () => {
        manager.close(id);
        undo();
      },
    },
  });
  return id;
}

function subscribeTop(onChange: () => void) {
  const query = window.matchMedia(topQuery);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

/**
 * The open modal dialogs, last opened last. Content outside a modal dialog
 * is inert, so toasts move into the top one to stay above it and clickable.
 */
let modals: HTMLDialogElement[] = [];

function subscribeModals(onChange: () => void) {
  modals = Array.from(document.querySelectorAll("dialog")).filter((dialog) =>
    dialog.matches(":modal"),
  );
  const observer = new MutationObserver((records) => {
    for (const { target } of records) {
      if (!(target instanceof HTMLDialogElement)) continue;
      modals = modals.filter((dialog) => dialog !== target);
      if (target.isConnected && target.matches(":modal")) modals.push(target);
    }
    onChange();
  });
  observer.observe(document.body, {
    subtree: true,
    attributes: true,
    attributeFilter: ["open"],
  });
  return () => observer.disconnect();
}

/** Renders every toast. Mounted once, in the root layout. */
export function Toaster() {
  return (
    <Toast.Provider toastManager={manager} limit={3}>
      <Viewport />
    </Toast.Provider>
  );
}

/** Only while there are toasts, so dialogs don't carry an empty viewport. */
function Viewport() {
  const { toasts } = Toast.useToastManager();
  const host = useSyncExternalStore(
    subscribeModals,
    () => modals.at(-1) ?? null,
    () => null,
  );
  const top = useSyncExternalStore(
    subscribeTop,
    () => window.matchMedia(topQuery).matches,
    () => false,
  );
  // The portal mounts its content after this renders, so the viewport
  // opens itself from its ref.
  const openViewport = useCallback((viewport: HTMLDivElement | null) => {
    if (viewport?.isConnected && !viewport.matches(":popover-open"))
      viewport.showPopover();
  }, []);
  if (!toasts.length) return null;
  return (
    // A new host re-mounts the viewport, re-opening it on top.
    <Toast.Portal key={host ? "dialog" : "body"} container={host ?? undefined}>
      <Toast.Viewport
        // The top layer, so it shows above dialogs, sheets and the map.
        popover="manual"
        ref={openViewport}
        aria-label="Varsler"
        className="toast-viewport"
        data-side={top ? "top" : "bottom"}
      >
        <Toasts top={top} />
      </Toast.Viewport>
    </Toast.Portal>
  );
}

function Toasts({ top }: { top: boolean }) {
  const { toasts } = Toast.useToastManager();
  return toasts.map((toast) => (
    <Toast.Root
      key={toast.id}
      toast={toast}
      swipeDirection={top ? ["up", "left", "right"] : ["down", "left", "right"]}
      className="toast"
    >
      <Toast.Content
        className={cn(
          "flex min-h-13 items-center gap-3 overflow-hidden py-1.5 pr-2 pl-4",
          "transition-opacity duration-200 data-behind:opacity-0 data-expanded:opacity-100",
        )}
      >
        {toast.type === "error" ? (
          <CircleAlert size={18} className="shrink-0 text-on-inverse/75" />
        ) : (
          <span className="grid size-5 shrink-0 place-items-center rounded-full bg-on-inverse text-inverse">
            <Check size={13} strokeWidth={3} />
          </span>
        )}
        <Toast.Title className="min-w-0 flex-1 py-2 text-ui leading-snug font-medium" />
        <Toast.Action
          className={cn(
            "inline-flex min-h-10 shrink-0 items-center rounded-lg px-3 text-ui font-semibold text-on-inverse",
            "transition-colors duration-150 hover:bg-on-inverse/12 active:bg-on-inverse/18",
            "focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-on-inverse",
            "motion-reduce:transition-none",
          )}
        />
        <Toast.Close
          aria-label="Lukk melding"
          className={cn(
            "-ml-1 inline-flex size-8 shrink-0 items-center justify-center rounded-lg text-on-inverse/65",
            "transition-colors duration-150 hover:bg-on-inverse/12 hover:text-on-inverse",
            "focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-on-inverse",
            "motion-reduce:transition-none",
          )}
        >
          <X size={16} />
        </Toast.Close>
      </Toast.Content>
    </Toast.Root>
  ));
}
