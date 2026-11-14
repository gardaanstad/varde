"use client";

import { LoaderCircle, UserRound, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "./auth-provider";
import GoogleSignIn from "./google-sign-in";
import AccountSettings from "./account-settings";
import ProfileEditor from "./profile-editor";
import { ProfileContent } from "./profile-page";
import { currentPath } from "./username-form";
import { accountProfile } from "../lib/profiles";
import { cn } from "../lib/cn";
import { accountView, iconButton } from "../lib/ui";

export default function AccountPanel({
  onBack,
  initialView = "profile",
  onSignedOut,
}: {
  onBack?: () => void;
  initialView?: "profile" | "settings";
  /** Signed out in place; without it the page reloads where it is. */
  onSignedOut?: () => void;
}) {
  const { user, pending } = useAuth();
  const [view, setView] = useState<"profile" | "edit" | "settings">(
    initialView,
  );
  const editTrigger = useRef<HTMLButtonElement>(null);
  const editHeading = useRef<HTMLHeadingElement>(null);
  // Without a username there is no profile yet; one is chosen in UsernamePrompt.
  const activeView = user?.username ? view : "signin";

  // Focus follows a switch once the view it lands on is shown.
  const switched = useRef(false);
  function switchView(next: typeof view) {
    switched.current = true;
    setView(next);
  }
  useEffect(() => {
    if (!switched.current) return;
    switched.current = false;
    (view === "edit" ? editHeading : editTrigger).current?.focus({
      preventScroll: true,
    });
  }, [view]);

  const scroll =
    "min-h-0 flex-1 overflow-y-auto overscroll-contain scrollbar-thin";
  // Top-level views read like any profile; the dialog or this button closes.
  const top = cn(
    scroll,
    "px-4.5 pb-8 md:px-gutter-scroll",
    onBack ? "pt-7 max-sm:pt-1" : "pt-1",
  );

  return (
    <div
      data-account-panel
      className="relative flex h-full min-h-0 flex-col bg-surface"
    >
      {onBack && (
        <button
          type="button"
          className={cn(iconButton, "absolute top-0 right-1.5 z-10 rounded-lg")}
          onClick={onBack}
          aria-label="Lukk"
        >
          <X size={20} />
        </button>
      )}
      <div
        data-drawer-scroll
        className={cn(
          top,
          "flex-col",
          accountView,
          activeView === "signin" ? "flex" : "hidden",
        )}
      >
        {pending ? (
          <p
            role="status"
            className="flex flex-1 items-center justify-center gap-2 text-sm text-muted"
          >
            <LoaderCircle
              size={18}
              className="animate-spin motion-reduce:animate-none"
              aria-hidden="true"
            />
            Henter profilen din …
          </p>
        ) : (
          <>
            <div className="flex items-center gap-4 pr-10">
              <span
                aria-hidden="true"
                className="grid size-14 shrink-0 place-items-center rounded-full bg-accent-soft text-accent"
              >
                <UserRound size={24} />
              </span>
              <h3 className="min-w-0 text-title">Logg inn</h3>
            </div>
            <div className="mt-6 space-y-3">
              {!user && <GoogleSignIn next={currentPath()} />}
              <p className="text-xs leading-5 text-muted">
                E-posten din vises aldri.
              </p>
            </div>
          </>
        )}
      </div>
      {user?.username && (
        <>
          <div
            data-drawer-scroll
            className={cn(
              top,
              accountView,
              activeView !== "profile" && "hidden",
            )}
          >
            <ProfileContent
              profile={accountProfile({ ...user, username: user.username })}
              onEdit={() => switchView("edit")}
              editRef={editTrigger}
            />
          </div>
          <div
            data-drawer-scroll
            className={cn(
              top,
              accountView,
              activeView !== "edit" && "hidden",
            )}
          >
            <h2
              ref={editHeading}
              tabIndex={-1}
              className="mb-4 text-heading outline-none"
            >
              Rediger profil
            </h2>
            <ProfileEditor
              key={user.id}
              user={user}
              onSaved={() => switchView("profile")}
            />
          </div>
          <div
            className={cn(
              "min-h-0 flex-1 flex-col",
              accountView,
              activeView === "settings" ? "flex" : "hidden",
            )}
          >
            <AccountSettings
              key={user.id}
              user={user}
              embedded
              onSignedOut={onSignedOut}
            />
          </div>
        </>
      )}
    </div>
  );
}
