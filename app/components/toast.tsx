"use client";
import { useLayoutEffect, useRef } from "react";
import { Check, X } from "lucide-react";
import { cn } from "../lib/cn";
import { iconButton, textButton } from "../lib/ui";

export type ToastMessage = { message: string; undo?: () => void };

/**
 * A short confirmation in the top layer, so it shows above open dialogs.
 * It re-opens wherever it mounts, such as inside a project dialog.
 */
export default function Toast({
  toast,
  mobile,
  onClose,
}: {
  toast: ToastMessage;
  mobile: boolean;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    ref.current?.showPopover();
  }, []);
  return (
    <div
      ref={ref}
      popover="manual"
      className={cn(
        "fixed inset-auto left-1/2 z-[2000] flex w-max max-w-[calc(100vw-30px)] -translate-x-1/2 items-center gap-2.5 rounded-lg bg-ink px-4 py-3 text-ui text-white shadow-[0_8px_24px_rgb(20_28_24/0.24)] motion-safe:animate-preview-in",
        mobile ? "bottom-[calc(76px+env(safe-area-inset-bottom))]" : "bottom-[45px]",
      )}
      role="status"
    >
      <Check size={17} />
      <span>{toast.message}</span>
      {toast.undo && (
        <button
          className={cn(
            textButton,
            "ml-1 min-h-11 px-1 text-xs text-white hover:text-white",
          )}
          onClick={toast.undo}
        >
          Angre
        </button>
      )}
      <button
        className={cn(
          iconButton,
          "ml-1 size-11 rounded-lg text-white/80 hover:bg-white/15 hover:text-white",
        )}
        aria-label="Lukk melding"
        onClick={onClose}
      >
        <X size={15} />
      </button>
    </div>
  );
}
