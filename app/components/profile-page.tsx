"use client";

import Link from "next/link";
import { useId, type ReactNode, type Ref } from "react";
import {
  ArrowLeft,
  ArrowUpRight,
  CalendarDays,
  MapPin,
  MessageCircle,
  Pencil,
} from "lucide-react";
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
  embedded = false,
  onEdit,
  editRef,
  actions,
  links,
  onOpenProject,
}: {
  profile: Profile;
  embedded?: boolean;
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
  const Name = embedded ? "h3" : "h1";
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

  return (
    <div data-public-profile>
      <div
        className={cn(
          !embedded &&
            "mt-6 rounded-panel border border-border bg-surface p-6 shadow-card sm:p-8",
        )}
      >
        <header
          className={cn(
            "flex items-center gap-4 sm:gap-5",
            embedded && "pr-10",
          )}
        >
          <ProfileAvatar
            name={profile.username}
            tone={profile.tone}
            className={
              embedded
                ? "size-14 text-xl"
                : "size-16 text-2xl sm:size-20 sm:text-3xl"
            }
          />
          <div className="min-w-0">
            <Name
              className={cn(
                "font-semibold tracking-tight wrap-anywhere",
                embedded
                  ? "text-2xl max-sm:text-xl"
                  : "text-[clamp(22px,4vw,32px)]",
              )}
            >
              {profile.username}
            </Name>
          </div>
        </header>
        {profile.bio && (
          <p className="mt-5 max-w-140 text-sm leading-6 whitespace-pre-wrap wrap-anywhere text-ink/80">
            {profile.bio}
          </p>
        )}
        <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-xs text-muted">
          {profile.location && (
            <span className="inline-flex min-w-0 items-start gap-1.5 wrap-anywhere">
              <MapPin
                size={15}
                className="mt-0.5 shrink-0"
                aria-hidden="true"
              />
              {profile.location}
            </span>
          )}
          <span className="inline-flex min-w-0 items-start gap-1.5 wrap-anywhere">
            <CalendarDays
              size={15}
              className="mt-0.5 shrink-0"
              aria-hidden="true"
            />
            Medlem siden{" "}
            {new Intl.DateTimeFormat("nb-NO", {
              month: "long",
              year: "numeric",
            }).format(new Date(profile.joined))}
          </span>
          {profile.example && <span>Eksempelprofil</span>}
        </div>

        {ownProfile && (onEdit || actions) && (
          <div className="mt-4 flex gap-2">
            {onEdit && (
              <button
                ref={editRef}
                type="button"
                onClick={onEdit}
                className={cn(secondaryButton, "flex-1 sm:flex-none")}
              >
                <Pencil size={16} aria-hidden="true" />
                Rediger profil
              </button>
            )}
            {actions}
          </div>
        )}
        {ownProfile && links}
      </div>
      <section
        className={cn("mt-8", embedded && "mt-5 border-t border-border pt-4")}
        aria-labelledby={`${id}-contributions`}
      >
        <h2
          id={`${id}-contributions`}
          className={cn(
            "flex items-center gap-2 font-semibold",
            embedded ? "text-body" : "text-lg",
          )}
        >
          Innspill
          {contributions.length > 0 && (
            <span className="rounded-md bg-surface-muted px-2 py-0.5 text-xs tabular-nums text-muted">
              {contributions.length}
            </span>
          )}
        </h2>
        {contributions.length ? (
          contributions.map((comment) => {
            const title = projectTitles.get(comment.projectId);
            return (
              <article
                key={comment.id}
                className={cn(
                  embedded
                    ? "border-b border-border py-3.5 last:border-b-0"
                    : "mt-4 rounded-2xl border border-border bg-surface px-5 py-4 sm:px-6",
                )}
              >
                <div className="flex flex-wrap items-baseline gap-x-2.5">
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
                      "inline-flex min-w-0 items-center gap-1 wrap-anywhere rounded-sm text-[14px] font-semibold text-ink",
                      "decoration-border-strong underline-offset-3 hover:underline",
                    )}
                  >
                    {title || "Se prosjektet"}
                    <ArrowUpRight
                      size={14}
                      className="shrink-0 text-muted"
                      aria-hidden="true"
                    />
                  </Link>
                  <RelativeTime
                    date={comment.date}
                    className="text-xs text-muted"
                  />
                </div>
                <p className="mt-1 text-sm leading-6 whitespace-pre-wrap wrap-anywhere text-ink/90">
                  {comment.text}
                </p>
                {comment.parentId && (
                  <span className="mt-2.5 block text-xs text-muted">
                    Svar i samtalen
                  </span>
                )}
              </article>
            );
          })
        ) : embedded ? (
          <p className="mt-3 text-sm text-muted">Ingen innspill ennå.</p>
        ) : (
          <div className="mt-4 flex min-h-52 flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-border-strong px-6 py-8 text-center text-muted">
            <span className="grid size-12 place-items-center rounded-full bg-accent-soft text-accent">
              <MessageCircle size={22} aria-hidden="true" />
            </span>
            <h3 className="text-sm font-semibold text-ink">
              Ingen innspill ennå
            </h3>
            <p className="max-w-77.5 text-xs leading-[1.7]">
              {ownProfile
                ? "Bli med i en samtale om et prosjekt. Innspillene dine samles her."
                : `Innspillene til @${profile.username} vil vises her.`}
            </p>
            {ownProfile && (
              <Link href="/" className={cn(secondaryButton, "mt-1")}>
                Utforsk prosjekter
                <ArrowUpRight size={16} aria-hidden="true" />
              </Link>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
