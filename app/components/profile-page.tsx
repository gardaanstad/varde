"use client";

import Link from "next/link";
import { useId, type Ref } from "react";
import { CalendarDays, MapPin, Pencil } from "lucide-react";
import { cn } from "../lib/cn";
import RelativeTime from "./relative-time";
import { type Profile } from "../lib/profiles";
import { projectHref } from "../lib/data";
import { useCommunity } from "./community-provider";
import { useAuth } from "./auth-provider";
import { iconButton } from "../lib/ui";
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
    >
      <div className="flex max-h-[min(520px,calc(100dvh-48px))] flex-col">
        {/* Centred on the dialog's close button. */}
        <h2 className="flex h-19 shrink-0 items-center px-6 pr-18 text-heading max-sm:h-17">
          Rediger profil
        </h2>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 pb-6 scrollbar-thin">
          <ProfileEditor user={user} onSaved={onClose} />
        </div>
      </div>
    </Dialog>
  );
}

export function ProfileContent({
  profile: initialProfile,
  onEdit,
  editRef,
  onOpenProject,
}: {
  profile: Profile;
  onEdit?: () => void;
  editRef?: Ref<HTMLButtonElement>;
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
      <header className="flex items-center gap-3">
        <ProfileAvatar
          name={profile.username}
          tone={profile.tone}
          className="size-12 text-lg"
        />
        <div className="min-w-0 flex-1">
          <h3 className="text-heading wrap-anywhere">{profile.username}</h3>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs leading-4.5 text-muted [&>span]:inline-flex [&>span]:min-w-0 [&>span]:items-center [&>span]:gap-1 [&_svg]:shrink-0">
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
        {ownProfile && onEdit && (
          <button
            ref={editRef}
            type="button"
            onClick={onEdit}
            className={cn(iconButton, "-mr-2.5 size-10 rounded-lg")}
            aria-label="Rediger profil"
            data-tooltip="Rediger profil"
            data-press=""
          >
            <Pencil size={17} aria-hidden="true" />
          </button>
        )}
      </header>
      {profile.bio && (
        <p className="mt-3 text-body leading-[1.65] whitespace-pre-wrap wrap-anywhere text-ink-soft">
          {profile.bio}
        </p>
      )}

      <section className="mt-5" aria-labelledby={`${id}-contributions`}>
        <h2
          id={`${id}-contributions`}
          className="flex items-center gap-2 border-b border-border pb-2 text-body font-semibold"
        >
          Kommentarer
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
                      data-press=""
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
                      Svar på kommentar
                    </span>
                  )}
                </li>
              );
            })}
          </ol>
        ) : (
          <p className="py-6 text-center text-sm text-muted">
            Ingen kommentarer ennå
          </p>
        )}
      </section>
    </div>
  );
}
