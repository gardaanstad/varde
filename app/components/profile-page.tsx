"use client";

import Link from "next/link";
import { useId, type ReactNode, type Ref } from "react";
import { ArrowLeft, CalendarDays, MapPin, Pencil } from "lucide-react";
import { cn } from "../lib/cn";
import RelativeTime from "./relative-time";
import { type Profile } from "../lib/profiles";
import { projectHref } from "../lib/data";
import { useCommunity } from "./community-provider";
import { useAuth } from "./auth-provider";
import { secondaryButton, textButton } from "../lib/ui";
import ProfileAvatar from "./profile-avatar";
import ProfileEditor from "./profile-editor";
import Dialog from "./dialog";

export function ProfileEditDialog({ onClose }: { onClose: () => void }) {
  const { user } = useAuth();
  if (!user?.username) return null;
  return (
    <Dialog
      title="Rediger profil"
      onClose={onClose}
      className="max-h-[calc(100dvh-32px)] overflow-hidden rounded-panel border-border shadow-panel"
      initialFocusSelector="[data-editor-back]"
    >
      <div className="flex h-[min(560px,calc(100dvh-48px))] flex-col">
        <header className="flex h-19 shrink-0 items-center gap-3 border-b border-border px-6 pr-18">
          <button
            data-editor-back
            type="button"
            className={cn(textButton, "-ml-2 text-muted")}
            onClick={onClose}
          >
            <ArrowLeft size={16} aria-hidden="true" />
            Tilbake
          </button>
          <h2 className="text-sm font-semibold">Rediger profil</h2>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-6 scrollbar-thin">
          <ProfileEditor user={user} />
        </div>
      </div>
    </Dialog>
  );
}

export function ProfileContent({
  profile: initialProfile,
  onEdit,
  editRef,
  actions,
  links,
  onOpenProject,
}: {
  profile: Profile;
  onEdit?: () => void;
  editRef?: Ref<HTMLButtonElement>;
  /** Extra controls beside the edit button on your own profile. */
  actions?: ReactNode;
  /** Shortcuts under the profile header on your own profile. */
  links?: ReactNode;
  /** Opens a contribution's project in place instead of navigating. */
  onOpenProject?: (projectId: string) => void;
}) {
  const id = useId();
  const { comments, projects } = useCommunity();
  const { user } = useAuth();
  const ownProfile = user?.username === initialProfile.username;
  const profile = ownProfile
    ? { ...initialProfile, bio: user.bio || "", location: user.location || "" }
    : initialProfile;
  const contributions = comments
    .filter((comment) => comment.author === profile.username)
    .sort((a, b) => b.date.localeCompare(a.date));
  const projectTitles = new Map(projects.map((item) => [item.id, item.title]));
  const joined = new Intl.DateTimeFormat("nb-NO", {
    month: "long",
    year: "numeric",
  }).format(new Date(profile.joined));

  return (
    <div data-public-profile>
      <header className="flex items-center gap-3.5">
        <ProfileAvatar
          name={profile.username}
          tone={profile.tone}
          className="size-13 text-xl"
        />
        <div className="min-w-0">
          <h3 className="text-title wrap-anywhere">
            {profile.username}
          </h3>
          <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs leading-4.5 text-muted [&>span]:inline-flex [&>span]:min-w-0 [&>span]:items-center [&>span]:gap-1 [&_svg]:shrink-0">
            {profile.location && (
              <span className="wrap-anywhere">
                <MapPin size={14} aria-hidden="true" />
                {profile.location}
              </span>
            )}
            <span>
              <CalendarDays size={14} aria-hidden="true" />
              Medlem siden {joined}
            </span>
            {profile.example && <span>Eksempelprofil</span>}
          </p>
        </div>
      </header>
      {profile.bio && (
        <p className="mt-4 text-body leading-[1.65] whitespace-pre-wrap wrap-anywhere text-ink-soft">
          {profile.bio}
        </p>
      )}

      {ownProfile && (onEdit || actions) && (
        <div className="mt-4 flex gap-2">
          {onEdit && (
            <button
              ref={editRef}
              type="button"
              onClick={onEdit}
              className={cn(secondaryButton, "min-h-10 flex-1 text-ui")}
            >
              <Pencil size={14} aria-hidden="true" />
              Rediger profil
            </button>
          )}
          {actions}
        </div>
      )}
      {ownProfile && links}
      <section className="mt-6" aria-labelledby={`${id}-contributions`}>
        <h2
          id={`${id}-contributions`}
          className="flex items-center gap-2 border-b border-border pb-2 text-body font-semibold"
        >
          Innspill
          {contributions.length > 0 && (
            <span className="text-ui font-normal text-muted tabular-nums">
              {contributions.length}
            </span>
          )}
        </h2>
        {contributions.length ? (
          <ol>
            {contributions.map((comment) => {
              const title = projectTitles.get(comment.projectId);
              return (
                <li
                  key={comment.id}
                  className="border-b border-border py-3 last:border-b-0"
                >
                  <div className="flex min-w-0 items-baseline gap-2">
                    <Link
                      href={projectHref(comment.projectId)}
                      onClick={(event) => {
                        if (
                          !onOpenProject ||
                          event.metaKey ||
                          event.ctrlKey ||
                          event.shiftKey
                        )
                          return;
                        event.preventDefault();
                        onOpenProject(comment.projectId);
                      }}
                      className={cn(
                        "min-w-0 truncate rounded-sm text-ui font-semibold text-ink",
                        "decoration-border-strong underline-offset-3 hover:underline",
                      )}
                    >
                      {title || "Se prosjektet"}
                    </Link>
                    <RelativeTime
                      date={comment.date}
                      className="shrink-0 text-xs text-muted"
                    />
                  </div>
                  <p className="mt-0.5 text-sm leading-normal whitespace-pre-wrap wrap-anywhere text-ink-soft">
                    {comment.text}
                  </p>
                  {comment.parentId && (
                    <span className="mt-1 block text-xs text-muted">
                      Svar i samtalen
                    </span>
                  )}
                </li>
              );
            })}
          </ol>
        ) : (
          <p className="py-6 text-center text-sm text-muted">
            Ingen innspill ennå
          </p>
        )}
      </section>
    </div>
  );
}
