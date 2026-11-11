"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { LoaderCircle, Settings, UserRound, X } from "lucide-react";
import {
  accountProfile,
  getSeedProfile,
  type Profile,
} from "../lib/profiles";
import { apiRequest } from "../lib/api-client";
import { cn } from "../lib/cn";
import { iconButton, secondaryButton } from "../lib/ui";
import { useAuth } from "./auth-provider";
import { ProfileContent, ProfileEditDialog } from "./profile-page";

/** A public profile shown over the explorer, like a project. */
export default function ProfileOverlay({
  username,
  embedded = false,
  onClose,
  onOpenProject,
}: {
  username: string;
  embedded?: boolean;
  /** Without it there is no close button: the sidebar panel has its own. */
  onClose?: () => void;
  onOpenProject: (projectId: string) => void;
}) {
  const { user } = useAuth();
  const [loaded, setLoaded] = useState<{
    username: string;
    profile: Profile | null;
  } | null>(null);
  const [editing, setEditing] = useState(false);
  const own =
    user?.username === username ? accountProfile({ ...user, username }) : null;
  const known = own || getSeedProfile(username);

  useEffect(() => {
    if (known) return;
    const controller = new AbortController();
    void apiRequest<{ profile: Profile }>(
      `/api/profiles/${encodeURIComponent(username)}`,
      { signal: controller.signal },
    )
      .then(({ profile }) => setLoaded({ username, profile }))
      .catch(() => {
        if (!controller.signal.aborted) setLoaded({ username, profile: null });
      });
    return () => controller.abort();
  }, [known, username]);

  const profile =
    known || (loaded?.username === username ? loaded.profile : undefined);

  return (
    <article
      className={cn(
        "relative flex min-h-0 flex-col bg-surface",
        embedded ? "h-full flex-1" : "max-h-[min(760px,calc(100dvh-64px))]",
      )}
      data-profile-overlay=""
    >
      {onClose && (
        <button
          type="button"
          className={cn(
            iconButton,
            "absolute top-3 right-[11px] z-10 rounded-lg max-sm:top-0 max-sm:right-1.5",
          )}
          onClick={onClose}
          aria-label="Lukk profil"
        >
          <X size={20} />
        </button>
      )}
      <div
        className={cn(
          "min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-8 scrollbar-thin max-md:px-4.5",
          onClose ? "pt-7 max-sm:pt-1" : "pt-1",
        )}
        data-drawer-scroll
      >
        {profile ? (
          <ProfileContent
            profile={profile}
            onEdit={() => setEditing(true)}
            actions={
              <Link
                href="/konto"
                className={cn(secondaryButton, "size-10 min-h-10 px-0")}
                aria-label="Kontoinnstillinger"
                data-tooltip="Kontoinnstillinger"
              >
                <Settings size={16} aria-hidden="true" />
              </Link>
            }
            onOpenProject={onOpenProject}
          />
        ) : (
          <p
            role="status"
            className="flex min-h-48 flex-col items-center justify-center gap-3 text-sm text-muted"
          >
            {profile === null ? (
              <>
                <UserRound size={22} aria-hidden="true" />
                Fant ikke @{username}
              </>
            ) : (
              <>
                <LoaderCircle
                  size={20}
                  className="animate-spin motion-reduce:animate-none"
                  aria-hidden="true"
                />
                Henter profilen …
              </>
            )}
          </p>
        )}
      </div>
      {editing && <ProfileEditDialog onClose={() => setEditing(false)} />}
    </article>
  );
}
