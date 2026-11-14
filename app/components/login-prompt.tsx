"use client";
import Link from "next/link";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { safeReturnPath } from "../lib/account-rules";
import { cn } from "../lib/cn";
import { iconButton } from "../lib/ui";
import { openedByKeyboard } from "./action-sheet";
import GoogleSignIn from "./google-sign-in";

const reduced = () =>
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * Asks a guest to log in, saying why. A bottom sheet on phones, like the
 * filter menus; a small card over the page on desktop. Signing in returns
 * to the page it was asked from.
 */
export default function LoginPrompt({
  reason,
  onClose,
}: {
  reason?: string;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const sheet = useRef<HTMLDivElement>(null);
  const trigger = useRef<Element | null>(null);
  const closing = useRef(false);
  const [next] = useState(() =>
    safeReturnPath(
      window.location.pathname + window.location.search + window.location.hash,
    ),
  );

  useLayoutEffect(() => {
    const dialog = ref.current;
    trigger.current = document.activeElement;
    dialog?.showModal();
    // A tap leaves focus on the prompt itself, so nothing looks chosen.
    if (openedByKeyboard(trigger.current))
      dialog?.querySelector<HTMLElement>("[data-login-google] button")?.focus();
    else dialog?.focus();
    return () => {
      dialog?.close();
      const target = trigger.current;
      if (target instanceof HTMLElement && target.isConnected)
        requestAnimationFrame(() => target.focus({ preventScroll: true }));
    };
  }, []);

  function close() {
    const dialog = ref.current;
    const panel = sheet.current;
    if (closing.current) return;
    closing.current = true;
    if (!dialog || !panel || reduced()) return onClose();
    const mobile = getComputedStyle(panel).getPropertyValue("--sheet") === "1";
    const options = { duration: mobile ? 220 : 140, easing: "ease-in", fill: "forwards" as const };
    const out = panel.animate(
      mobile
        ? [{ transform: "none" }, { transform: "translateY(100%)" }]
        : [
            { opacity: 1, transform: "none" },
            { opacity: 0, transform: "translateY(6px) scale(0.98)" },
          ],
      options,
    );
    dialog.animate([{ opacity: 1 }, { opacity: 0 }], {
      ...options,
      pseudoElement: "::backdrop",
    });
    out.finished.then(onClose, onClose);
  }

  // Signing in happens elsewhere; a session change closes the prompt.
  useEffect(() => {
    const onShow = (event: PageTransitionEvent) => {
      if (event.persisted) onClose();
    };
    window.addEventListener("pageshow", onShow);
    return () => window.removeEventListener("pageshow", onShow);
  }, [onClose]);

  return (
    <dialog
      ref={ref}
      aria-labelledby="login-prompt-title"
      aria-describedby={reason ? "login-prompt-reason" : undefined}
      data-login-prompt=""
      tabIndex={-1}
      className={cn(
        "m-auto overflow-visible border-0 bg-transparent p-0 text-ink outline-none",
        "backdrop:bg-scrim/25 motion-safe:backdrop:animate-backdrop-in",
        // Phones: a sheet along the bottom edge.
        "max-md:mb-0 max-md:w-full max-md:max-w-none",
        "md:w-[380px] md:max-w-[calc(100vw-32px)] md:backdrop:bg-scrim/33 md:backdrop:backdrop-blur-[4px]",
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
        className={cn(
          "relative bg-surface",
          "max-md:rounded-t-sheet max-md:border-t max-md:border-border max-md:px-4.5 max-md:pb-[calc(16px+env(safe-area-inset-bottom))] max-md:shadow-bar max-md:[--sheet:1] max-md:motion-safe:animate-sheet-in",
          "md:rounded-[18px] md:border md:border-border md:p-6 md:shadow-dialog md:motion-safe:animate-dialog-enter",
        )}
      >
        <div
          aria-hidden="true"
          className="flex justify-center pt-2 pb-1 md:hidden"
        >
          <span className="h-1 w-9 rounded-full bg-ink/15" />
        </div>
        <button
          type="button"
          className={cn(
            iconButton,
            "absolute top-2 right-2 rounded-lg max-md:top-1.5 max-md:right-1.5",
          )}
          aria-label="Lukk"
          onClick={close}
        >
          <X size={19} />
        </button>
        <h2
          id="login-prompt-title"
          className="pr-10 text-title max-md:mt-3"
        >
          Logg inn
        </h2>
        {reason && (
          <p
            id="login-prompt-reason"
            className="mt-1.5 pr-8 text-sm leading-normal text-muted"
          >
            {reason}
          </p>
        )}
        <div className="mt-5" data-login-google="">
          <GoogleSignIn next={next} label="Logg inn med Google" />
        </div>
        <p className="mt-3 text-center text-xs leading-5 text-muted">
          E-posten din vises aldri.{" "}
          <Link href="/personvern" className="underline hover:text-ink">
            Personvern
          </Link>
        </p>
      </div>
    </dialog>
  );
}
