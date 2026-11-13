"use client";

import Link from "next/link";
import {
  ArrowLeft,
  Bell,
  ChevronRight,
  Inbox,
  LoaderCircle,
  LogOut,
  Settings,
  UserRound,
  X,
} from "lucide-react";
import { useRef, useState } from "react";
import { useAuth } from "./auth-provider";
import GoogleSignIn from "./google-sign-in";
import AccountSettings from "./account-settings";
import ProfileEditor from "./profile-editor";
import { ProfileContent } from "./profile-page";
import { authClient } from "../lib/auth-client";
import { navigateWithFreshSession } from "../lib/auth-navigation";
import UsernameForm, { currentPath } from "./username-form";
import { accountProfile } from "../lib/profiles";
import { cn } from "../lib/cn";
import {
  accountAction,
  accountView,
  iconButton,
  secondaryButton,
  textButton,
} from "../lib/ui";

/** A row in the profile's shortcut list, divided like the project list. */
const profileLink = cn(
  "relative isolate flex min-h-12 w-full items-center gap-3 border-b border-border text-left text-sm font-medium text-ink",
  "before:absolute before:inset-x-[-10px] before:inset-y-0.5 before:-z-1 before:rounded-lg hover:before:bg-surface-muted/65",
  "outline-none focus-visible:before:outline-2 focus-visible:before:outline-focus",
  "[&>svg]:shrink-0 [&>svg]:text-muted",
);

export default function AccountPanel({
  onBack,
  onFollowing,
  onSuggestions,
  followingCount = 0,
  suggestionCount = 0,
  reviewedCount = 0,
  initialView = "profile",
  onSignedOut,
}: {
  onBack?: () => void;
  /** Opens the followed projects, where the app has no other entry to them. */
  onFollowing?: () => void;
  /** Opens the suggestions in place; otherwise they are a link. */
  onSuggestions?: () => void;
  followingCount?: number;
  /** Pending suggestions: one's own, or the whole queue for moderators. */
  suggestionCount?: number;
  /** One's own suggestions reviewed since last looked; shown as a badge. */
  reviewedCount?: number;
  initialView?: "profile" | "settings";
  /** Signed out in place; without it the page reloads where it is. */
  onSignedOut?: () => void;
}) {
  const { user, pending } = useAuth();
  const [view, setView] = useState<"profile" | "edit" | "settings">(
    initialView,
  );
  const [error, setError] = useState("");
  const [signingOut, setSigningOut] = useState(false);
  const settingsTrigger = useRef<HTMLButtonElement>(null);
  const editTrigger = useRef<HTMLButtonElement>(null);
  const backButton = useRef<HTMLButtonElement>(null);
  // Without a username there is no profile yet, only sign-in.
  const activeView = user?.username ? view : "signin";

  function switchView(next: typeof view) {
    const from = view;
    setView(next);
    requestAnimationFrame(() => {
      const target =
        next !== "profile"
          ? backButton
          : from === "settings"
            ? settingsTrigger
            : editTrigger;
      target.current?.focus({ preventScroll: true });
    });
  }

  async function signOut() {
    if (signingOut) return;
    setSigningOut(true);
    setError("");
    try {
      const result = await authClient.signOut();
      if (result.error) throw new Error();
      if (onSignedOut) onSignedOut();
      else navigateWithFreshSession(currentPath());
    } catch {
      setError("Kunne ikke logge ut. Prøv igjen.");
      setSigningOut(false);
    }
  }

  const subView = activeView === "edit" || activeView === "settings";
  const scroll =
    "min-h-0 flex-1 overflow-y-auto overscroll-contain scrollbar-thin";
  // Top-level views read like any profile; the dialog or this button closes.
  const top = cn(
    scroll,
    "px-4.5 pb-8 md:px-gutter-scroll",
    onBack ? "pt-7 max-sm:pt-1" : "pt-1",
  );

  const suggestionsLink = (
    <>
      <Inbox size={18} aria-hidden="true" />
      <span className="flex-1">Forslag</span>
      {reviewedCount > 0 ? (
        <span
          className="inline-flex h-4.5 min-w-4.5 items-center justify-center rounded-full bg-accent px-1.25 text-2xs leading-none font-semibold text-on-accent tabular-nums"
          data-reviewed
        >
          {reviewedCount}
          <span className="sr-only"> behandlet</span>
        </span>
      ) : (
        suggestionCount > 0 && (
          <span className="text-ui text-muted tabular-nums">
            {suggestionCount}
          </span>
        )
      )}
      <ChevronRight size={16} aria-hidden="true" />
    </>
  );

  return (
    <div
      data-account-panel
      className="relative flex h-full min-h-0 flex-col bg-surface"
    >
      {subView ? (
        <header
          className={cn(
            "flex h-19 shrink-0 items-center gap-3 border-b border-border px-6",
            !onBack && "pr-18",
          )}
        >
          <button
            ref={backButton}
            type="button"
            className={cn(textButton, "-ml-2 shrink-0 text-muted")}
            onClick={() => switchView("profile")}
          >
            <ArrowLeft size={16} aria-hidden="true" />
            Tilbake
          </button>
          <h2 className="min-w-0 text-sm font-semibold">
            {activeView === "settings"
              ? "Kontoinnstillinger"
              : "Rediger profil"}
          </h2>
        </header>
      ) : (
        onBack && (
          <button
            type="button"
            className={cn(
              iconButton,
              "absolute top-0 right-1.5 z-10 rounded-lg",
            )}
            onClick={onBack}
            aria-label="Lukk"
          >
            <X size={20} />
          </button>
        )
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
              <h3 className="min-w-0 text-title">
                {user ? "Velg brukernavn" : "Logg inn"}
              </h3>
            </div>
            <div className="mt-6 space-y-3">
              {user ? (
                // Chosen here, then the page reloads where it is.
                <UsernameForm />
              ) : (
                <GoogleSignIn next={currentPath()} />
              )}
              <p className="text-xs leading-5 text-muted">
                E-posten din vises aldri.
              </p>
            </div>
            {user && (
              <div className="mt-auto border-t border-border pt-2">
                <button
                  type="button"
                  disabled={signingOut}
                  onClick={() => void signOut()}
                  className={cn(accountAction, "min-h-11 text-muted")}
                >
                  <LogOut size={18} aria-hidden="true" />
                  {signingOut ? "Logger ut …" : "Logg ut"}
                </button>
                {error && (
                  <p
                    role="alert"
                    className="px-3 pt-2 text-xs leading-6 text-danger"
                  >
                    {error}
                  </p>
                )}
              </div>
            )}
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
              actions={
                <button
                  ref={settingsTrigger}
                  type="button"
                  className={cn(secondaryButton, "size-10 min-h-10 px-0")}
                  data-press=""
                  onClick={() => switchView("settings")}
                  aria-label="Kontoinnstillinger"
                  data-tooltip="Kontoinnstillinger"
                >
                  <Settings size={16} aria-hidden="true" />
                </button>
              }
              links={
                <div className="mt-5 border-t border-border">
                  {onFollowing && (
                    <button
                      type="button"
                      className={profileLink}
                      data-press=""
                      onClick={onFollowing}
                    >
                      <Bell size={18} aria-hidden="true" />
                      <span className="flex-1">Følger</span>
                      {followingCount > 0 && (
                        <span className="text-ui text-muted tabular-nums">
                          {followingCount}
                        </span>
                      )}
                      <ChevronRight size={16} aria-hidden="true" />
                    </button>
                  )}
                  {onSuggestions ? (
                    <button
                      type="button"
                      className={profileLink}
                      data-press=""
                      onClick={onSuggestions}
                    >
                      {suggestionsLink}
                    </button>
                  ) : (
                    <Link
                      href="/forslag"
                      // Opening the page marks reviews as seen; never prefetch it.
                      prefetch={false}
                      className={profileLink}
                    >
                      {suggestionsLink}
                    </Link>
                  )}
                </div>
              }
            />
          </div>
          <div
            data-drawer-scroll
            className={cn(
              scroll,
              "p-6",
              accountView,
              activeView !== "edit" && "hidden",
            )}
          >
            <ProfileEditor key={user.id} user={user} />
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
