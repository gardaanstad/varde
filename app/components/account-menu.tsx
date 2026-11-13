"use client";
import { useRef, useState, type ReactNode } from "react";
import { Menu } from "@base-ui/react/menu";
import { Bookmark, Inbox, LogOut, Settings, ShieldOff } from "lucide-react";
import { useAuth } from "./auth-provider";
import ActionSheet, { SwitchTrack, type SheetAction } from "./action-sheet";
import ProfileAvatar from "./profile-avatar";
import { cn } from "../lib/cn";

const item = cn(
  "flex min-h-9 cursor-default items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-ink outline-none select-none",
  "data-highlighted:bg-surface-muted pointer-coarse:min-h-11",
  "[&>svg]:shrink-0 [&>svg]:text-muted",
);
const separator = "-mx-1.5 my-1.5 h-px bg-border";
const count = "ml-auto pl-3 text-xs text-muted tabular-nums";
const badge =
  "ml-auto inline-flex h-4.5 min-w-4.5 items-center justify-center rounded-full bg-accent px-1.25 text-2xs leading-none font-semibold text-on-accent tabular-nums";

/**
 * The signed-in member's menu from their avatar: their profile, what they
 * follow, suggestions and settings, then logging out. Moderators can also
 * view the app as a member. A dropdown on desktop, a sheet on phones.
 */
export default function AccountMenu({
  username,
  mobile,
  reviewed,
  suggestions,
  trigger,
  triggerLabel,
  triggerTooltip,
  triggerClassName,
  onProfile,
  onSaved,
  onSuggestions,
  onSettings,
  onMemberView,
  onSignOut,
}: {
  username: string;
  mobile: boolean;
  /** One's own suggestions reviewed since last looked. */
  reviewed: number;
  /** The queue, for moderators. */
  suggestions: number;
  trigger: ReactNode;
  triggerLabel: string;
  triggerTooltip?: string;
  triggerClassName: string;
  onProfile: () => void;
  onSaved: () => void;
  onSuggestions: () => void;
  onSettings: () => void;
  onMemberView: (on: boolean) => void;
  onSignOut: () => void;
}) {
  const { isModerator, canModerate, memberView } = useAuth();
  const [sheetOpen, setSheetOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  // A panel opened from the menu returns focus to the avatar, not to the
  // item that is gone once the menu closes.
  function run(action: () => void) {
    button.current?.focus({ preventScroll: true });
    action();
  }
  const suggestionCount = reviewed || (canModerate ? suggestions : 0);
  const suggestionTrailing =
    reviewed > 0 ? (
      <span className={badge} data-reviewed="">
        {reviewed}
        <span className="sr-only"> behandlet</span>
      </span>
    ) : suggestionCount > 0 ? (
      <span className={count}>{suggestionCount}</span>
    ) : null;

  if (mobile) {
    const actions: SheetAction[] = [
      {
        id: "profile",
        label: `@${username}`,
        detail: "Din profil",
        icon: <ProfileAvatar name={username} className="size-8 text-xs" />,
        onSelect: onProfile,
      },
      {
        id: "saved",
        label: "Lagret",
        icon: <Bookmark size={20} />,
        onSelect: onSaved,
        divided: true,
      },
      {
        id: "suggestions",
        label: "Forslag",
        icon: <Inbox size={20} />,
        trailing: suggestionTrailing,
        onSelect: onSuggestions,
      },
      {
        id: "settings",
        label: "Kontoinnstillinger",
        icon: <Settings size={20} />,
        onSelect: onSettings,
      },
      ...(isModerator
        ? [
            {
              id: "member-view",
              label: "Vis som vanlig bruker",
              icon: <ShieldOff size={20} />,
              checked: memberView,
              onSelect: () => onMemberView(!memberView),
              divided: true,
            },
          ]
        : []),
      {
        id: "sign-out",
        label: "Logg ut",
        icon: <LogOut size={20} />,
        onSelect: onSignOut,
        divided: true,
      },
    ];
    return (
      <>
        <button
          ref={button}
          type="button"
          className={triggerClassName}
          aria-label={triggerLabel}
          aria-haspopup="dialog"
          aria-expanded={sheetOpen}
          data-account-menu=""
          data-press=""
          onClick={() => setSheetOpen(true)}
        >
          {trigger}
        </button>
        {sheetOpen && (
          <ActionSheet
            label="Konto"
            actions={actions}
            onClose={() => setSheetOpen(false)}
          />
        )}
      </>
    );
  }

  return (
    <Menu.Root>
      <Menu.Trigger
        ref={button}
        className={triggerClassName}
        aria-label={triggerLabel}
        data-tooltip={triggerTooltip}
        // Base UI opens it on press already; no data-press here.
        data-account-menu=""
      >
        {trigger}
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner
          side="bottom"
          align="end"
          sideOffset={4}
          className="z-[1000]"
        >
          <Menu.Popup
            aria-label="Konto"
            className="min-w-60 rounded-xl border border-border bg-surface p-1.5 text-ui shadow-popover outline-none motion-safe:animate-menu-enter"
          >
            <Menu.Item
              className={cn(item, "gap-3 py-2")}
              onClick={() => run(onProfile)}
            >
              <ProfileAvatar name={username} className="size-8 text-xs" />
              <span className="flex min-w-0 flex-col">
                <span className="truncate font-medium">@{username}</span>
                <span className="text-xs text-muted">Din profil</span>
              </span>
            </Menu.Item>
            <Menu.Separator className={separator} />
            <Menu.Item className={item} onClick={() => run(onSaved)}>
              <Bookmark size={16} aria-hidden="true" />
              Lagret
            </Menu.Item>
            <Menu.Item className={item} onClick={() => run(onSuggestions)}>
              <Inbox size={16} aria-hidden="true" />
              Forslag
              {suggestionTrailing}
            </Menu.Item>
            <Menu.Item className={item} onClick={() => run(onSettings)}>
              <Settings size={16} aria-hidden="true" />
              Kontoinnstillinger
            </Menu.Item>
            {isModerator && (
              <>
                <Menu.Separator className={separator} />
                <Menu.CheckboxItem
                  className={item}
                  checked={memberView}
                  onCheckedChange={onMemberView}
                  closeOnClick
                >
                  <ShieldOff size={16} aria-hidden="true" />
                  <span className="mr-3 flex-1">Vis som vanlig bruker</span>
                  <SwitchTrack on={memberView} />
                </Menu.CheckboxItem>
              </>
            )}
            <Menu.Separator className={separator} />
            <Menu.Item className={item} onClick={() => run(onSignOut)}>
              <LogOut size={16} aria-hidden="true" />
              Logg ut
            </Menu.Item>
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}
