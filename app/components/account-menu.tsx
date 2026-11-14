"use client";
import { useRef, useState, type ReactNode } from "react";
import { Menu } from "@base-ui/react/menu";
import { Bookmark, LogOut, Settings, ShieldOff } from "lucide-react";
import { useAuth } from "./auth-provider";
import ActionSheet, { SwitchTrack, type SheetAction } from "./action-sheet";
import ProfileAvatar from "./profile-avatar";
import { cn } from "../lib/cn";

const item = cn(
  "flex min-h-9 cursor-default items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-ink outline-none select-none",
  "pointer-fine:data-highlighted:bg-surface-muted focus-visible:bg-surface-muted pointer-coarse:min-h-11",
  "[&>svg]:shrink-0 [&>svg]:text-muted",
);
const separator = "-mx-1.5 my-1.5 h-px bg-border";

/**
 * The signed-in member's menu from their avatar: their profile and
 * settings, what they saved, then logging out. Moderators can also
 * view the app as a member. A dropdown on desktop, a sheet on phones.
 */
export default function AccountMenu({
  username,
  mobile,
  trigger,
  triggerLabel,
  triggerTooltip,
  triggerClassName,
  onProfile,
  onSaved,
  onSettings,
  onMemberView,
  onSignOut,
}: {
  username: string;
  mobile: boolean;
  trigger: ReactNode;
  triggerLabel: string;
  triggerTooltip?: string;
  triggerClassName: string;
  onProfile: () => void;
  onSaved: () => void;
  onSettings: () => void;
  onMemberView: (on: boolean) => void;
  onSignOut: () => void;
}) {
  const { isModerator, memberView } = useAuth();
  const [sheetOpen, setSheetOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  // A panel opened from the menu returns focus to the avatar, not to the
  // item that is gone once the menu closes.
  function run(action: () => void) {
    button.current?.focus({ preventScroll: true });
    action();
  }
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
        id: "settings",
        label: "Kontoinnstillinger",
        icon: <Settings size={20} />,
        onSelect: onSettings,
      },
      {
        id: "saved",
        label: "Lagret",
        icon: <Bookmark size={20} />,
        onSelect: onSaved,
        divided: true,
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
            <Menu.Item className={item} onClick={() => run(onSettings)}>
              <Settings size={16} aria-hidden="true" />
              Kontoinnstillinger
            </Menu.Item>
            <Menu.Separator className={separator} />
            <Menu.Item className={item} onClick={() => run(onSaved)}>
              <Bookmark size={16} aria-hidden="true" />
              Lagret
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
