"use client";

import {
  useEffect,
  useId,
  useRef,
  useState,
  type MouseEvent,
  type PointerEvent,
  type ReactNode,
} from "react";
import { MapPin } from "lucide-react";
import { cn } from "../lib/cn";
import {
  getProfile,
  getSeedProfile,
  profileHref,
  type Profile,
} from "../lib/profiles";
import { apiRequest } from "../lib/api-client";

import { openProfile } from "../lib/profile-overlay";

import ProfileAvatar from "./profile-avatar";
import { useAuth } from "./auth-provider";

/** Avatar beside two lines: the name, and `children` (such as a date) below. */
export default function UserIdentity({
  username,
  children,
}: {
  username: string;
  children?: ReactNode;
}) {
  const [loaded, setLoaded] = useState<Profile | null>(null);
  const { user } = useAuth();
  const ownProfile = user?.username === username;
  const profile = ownProfile
    ? {
        ...getProfile(username),
        bio: user.bio || "",
        location: user.location || "",
      }
    : loaded?.username === username
      ? loaded
      : getProfile(username);
  const id = useId();
  const triggerRef = useRef<HTMLAnchorElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const skipFocus = useRef(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open || ownProfile || getSeedProfile(username)) return;
    const controller = new AbortController();
    void apiRequest<{ profile: Profile }>(
      `/api/profiles/${encodeURIComponent(username)}`,
      { signal: controller.signal },
    )
      .then(({ profile }) => setLoaded(profile))
      .catch(() => {});
    return () => controller.abort();
  }, [open, username, ownProfile]);
  function cancelTimer() {
    if (timerRef.current) clearTimeout(timerRef.current);
  }

  function close() {
    cancelTimer();
    previewRef.current?.hidePopover();
  }

  function show() {
    cancelTimer();
    const trigger = triggerRef.current;
    const preview = previewRef.current;
    if (!trigger || !preview) return;
    preview.showPopover();
    const anchor = trigger.getBoundingClientRect();
    const card = preview.getBoundingClientRect();
    preview.style.left = `${Math.max(12, Math.min(anchor.left, window.innerWidth - card.width - 12))}px`;
    const top =
      anchor.bottom + card.height + 8 < window.innerHeight - 12
        ? anchor.bottom + 8
        : anchor.top - card.height - 8;
    preview.style.top = `${Math.max(12, top)}px`;
  }

  function dismiss() {
    close();
    skipFocus.current = true;
    triggerRef.current?.focus({ preventScroll: true });
    skipFocus.current = false;
  }

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    [],
  );

  useEffect(() => {
    if (!open) return;
    const preview = previewRef.current;
    const scroller = triggerRef.current?.closest("[data-project-scroll]");
    const hide = () => preview?.hidePopover();
    scroller?.addEventListener("scroll", hide, { passive: true });
    window.addEventListener("resize", hide);
    return () => {
      scroller?.removeEventListener("scroll", hide);
      window.removeEventListener("resize", hide);
    };
  }, [open]);

  // Plain clicks open the profile over the current view.
  function go(event: MouseEvent) {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0)
      return;
    event.preventDefault();
    close();
    openProfile(username);
  }

  // Only the avatar and name preview the profile, not the rest of the row.
  const hover = {
    onPointerEnter: (event: PointerEvent) => {
      if (event.pointerType !== "mouse") return;
      cancelTimer();
      timerRef.current = setTimeout(show, 180);
    },
    onPointerLeave: (event: PointerEvent) => {
      if (event.pointerType !== "mouse") return;
      cancelTimer();
      timerRef.current = setTimeout(() => {
        if (!previewRef.current?.contains(document.activeElement)) close();
      }, 220);
    },
  };

  return (
    <div
      className="flex min-w-0 max-w-full items-start gap-2.5"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) close();
      }}
      onKeyDown={(event) => {
        if (
          event.key === "Escape" &&
          previewRef.current?.matches(":popover-open")
        ) {
          event.preventDefault();
          event.stopPropagation();
          dismiss();
        }
      }}
    >
      {/* The name button is the accessible trigger; the avatar mirrors it for pointers. */}
      <a
        href={profileHref(username)}
        tabIndex={-1}
        aria-hidden="true"
        className="shrink-0 rounded-full"
        onClick={go}
        {...hover}
      >
        <ProfileAvatar
          name={profile.username}
          tone={profile.tone}
          className="size-8 text-xs"
        />
      </a>
      <div className="min-w-0 flex-1">
        <div className="flex min-h-4.5 min-w-0">
          <a
            ref={triggerRef}
            href={profileHref(username)}
            className={cn(
              "min-w-0 rounded-sm text-left text-ui leading-[18px] font-semibold text-ink [overflow-wrap:anywhere]",
              "underline-offset-[3px] hover:underline focus-visible:underline aria-expanded:underline",
            )}
            aria-describedby={open ? id : undefined}
            onFocus={(event) => {
              if (!skipFocus.current && event.target.matches(":focus-visible"))
                show();
            }}
            onClick={go}
            {...hover}
          >
            {username}
          </a>
        </div>
        {children && (
          <div className="flex min-w-0 items-baseline gap-2">{children}</div>
        )}
      </div>
      <div
        id={id}
        ref={previewRef}
        popover="auto"
        role="dialog"
        aria-label={`Profilen til ${username}`}
        className="fixed inset-auto m-0 max-h-[calc(100dvh-24px)] w-72 max-w-[calc(100vw-24px)] overflow-y-auto overscroll-contain rounded-xl border border-border bg-surface p-4 text-sm text-ink shadow-panel motion-safe:[&:popover-open]:animate-menu-enter"
        onToggle={(event) => setOpen(event.newState === "open")}
        onPointerEnter={(event) => {
          if (event.pointerType === "mouse") cancelTimer();
        }}
      >
        <div className="flex items-center gap-3">
          <ProfileAvatar
            name={profile.username}
            tone={profile.tone}
            className="size-10 text-sm"
          />
          <div className="min-w-0">
            <h3 className="truncate text-body leading-5 font-semibold">
              {profile.username}
            </h3>
            {profile.location && (
              <p className="mt-0.5 flex items-center gap-1 text-xs text-muted">
                <MapPin size={12} className="shrink-0" aria-hidden="true" />
                <span className="truncate">{profile.location}</span>
              </p>
            )}
          </div>
        </div>
        {profile.bio && (
          <p className="mt-3 line-clamp-3 text-ui leading-5 whitespace-pre-wrap wrap-anywhere text-ink-soft">
            {profile.bio}
          </p>
        )}
        <a
          href={profileHref(username)}
          onClick={go}
          className={cn(
            "mt-3 flex min-h-9 items-center justify-center gap-1.5 rounded-lg bg-surface-muted text-ui font-medium text-ink",
            "transition-colors duration-150 hover:bg-ink/[0.08] motion-reduce:transition-none",
          )}
        >
          Gå til profil
        </a>
      </div>
    </div>
  );
}
