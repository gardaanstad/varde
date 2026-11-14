"use client";
import { useLayoutEffect, useRef, useState } from "react";
import { authClient } from "../lib/auth-client";
import { navigateWithFreshSession } from "../lib/auth-navigation";
import { cn } from "../lib/cn";
import { textButton } from "../lib/ui";
import { useAuth } from "./auth-provider";
import UsernameForm, { currentPath } from "./username-form";

/**
 * Signed in without a username: one is chosen over the page before anything
 * else. A bottom sheet on phones, a card on desktop, with no way to close it
 * but signing out.
 */
export default function UsernamePrompt() {
  const { user } = useAuth();
  if (!user || user.username) return null;
  return <Prompt />;
}

function Prompt() {
  const ref = useRef<HTMLDialogElement>(null);
  const [signingOut, setSigningOut] = useState(false);
  const open = useRef(true);
  useLayoutEffect(() => {
    const dialog = ref.current;
    open.current = true;
    dialog?.showModal();
    dialog?.querySelector<HTMLInputElement>("input")?.focus();
    // Phones: the sheet rides above the on-screen keyboard.
    const viewport = window.visualViewport;
    const lift = () => {
      if (!dialog || !viewport) return;
      const covered = window.innerHeight - viewport.height - viewport.offsetTop;
      dialog.style.setProperty("--keyboard", `${Math.max(0, covered)}px`);
    };
    viewport?.addEventListener("resize", lift);
    viewport?.addEventListener("scroll", lift);
    return () => {
      viewport?.removeEventListener("resize", lift);
      viewport?.removeEventListener("scroll", lift);
      open.current = false;
      dialog?.close();
    };
  }, []);

  async function signOut() {
    if (signingOut) return;
    setSigningOut(true);
    const result = await authClient.signOut().catch(() => null);
    if (result && !result.error) navigateWithFreshSession(currentPath());
    else setSigningOut(false);
  }

  return (
    <dialog
      ref={ref}
      aria-labelledby="username-prompt-title"
      data-username-prompt=""
      className={cn(
        "m-auto overflow-visible border-0 bg-transparent p-0 text-ink outline-none",
        "backdrop:bg-scrim/25 motion-safe:backdrop:animate-backdrop-in",
        "max-md:mb-(--keyboard,0px) max-md:w-full max-md:max-w-none",
        "md:w-[380px] md:max-w-[calc(100vw-32px)] md:backdrop:bg-scrim/33 md:backdrop:backdrop-blur-[4px]",
      )}
      onCancel={(event) => event.preventDefault()}
      // Browsers let a repeated Escape close it anyway; it opens again.
      onClose={(event) => {
        const dialog = event.currentTarget;
        if (open.current && dialog.isConnected) dialog.showModal();
      }}
    >
      <div
        className={cn(
          "bg-surface",
          "max-md:rounded-t-sheet max-md:border-t max-md:border-border max-md:px-4.5 max-md:pt-5 max-md:pb-[calc(12px+env(safe-area-inset-bottom))] max-md:shadow-bar max-md:motion-safe:animate-sheet-in",
          "md:rounded-[18px] md:border md:border-border md:p-6 md:pb-4 md:shadow-dialog md:motion-safe:animate-dialog-enter",
        )}
      >
        <h2 id="username-prompt-title" className="text-title">
          Hva skal vi kalle deg?
        </h2>
        <UsernameForm />
        <button
          type="button"
          disabled={signingOut}
          onClick={() => void signOut()}
          className={cn(textButton, "mx-auto mt-2 flex text-xs text-muted")}
        >
          {signingOut ? "Logger ut …" : "Logg ut"}
        </button>
      </div>
    </dialog>
  );
}
