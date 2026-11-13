"use client";
import { useMemo, useState } from "react";
import Image from "next/image";
import { Menu } from "@base-ui/react/menu";
import { ArrowDownUp, Bell, BellOff, Ellipsis, MapPin } from "lucide-react";
import {
  hasPhoto,
  type Project,
  projectPlace,
  statuses,
} from "../lib/data";
import {
  compareFollowed,
  type FollowedProject,
  type Following,
  unreadCount,
  unreadSummary,
} from "../lib/following";
import { cn } from "../lib/cn";
import { sortChoice, statusTone } from "../lib/ui";
import ChoiceSelect from "./choice-select";
import EmptyState from "./empty-state";
import { PanelHeader } from "./panel";
import RelativeTime from "./relative-time";

export type FollowedTarget = {
  updateId?: string;
  commentId?: string;
  section?: "discussion" | "updates";
};

/** A filled count for unread activity, so it never reads as a plain total. */
export function UnreadBadge({
  count,
  className,
}: {
  count: number;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-grid h-4.5 min-w-4.5 place-items-center rounded-full bg-accent px-1.25 text-2xs leading-none font-semibold text-on-accent tabular-nums",
        className,
      )}
      aria-label={`${count} med nytt`}
      role="img"
      data-unread-badge=""
    >
      {count > 99 ? "99+" : count}
    </span>
  );
}

// The project list's meta line.
const meta = "flex min-w-0 items-center text-xs leading-4.5 text-muted";
const separator =
  "before:mr-1.5 before:font-normal before:text-muted before:content-['·']";

type Row = { project: Project; summary: FollowedProject };

function FollowedRow({
  project,
  summary,
  onOpen,
  onUnfollow,
}: Row & {
  onOpen: (projectId: string, target: FollowedTarget) => void;
  onUnfollow: (projectId: string) => void;
}) {
  const unread = unreadCount(summary);
  const status = statuses[project.status];
  return (
    <li
      className={cn(
        // The project list's compact row: place, title, then where it stands.
        "relative isolate flex items-center gap-4 border-b border-border py-4 max-md:gap-3 max-md:py-3.5",
        // The hover wash bleeds past the text edge, like the project list.
        "before:absolute before:inset-x-[-12px] before:inset-y-2 before:-z-1 before:rounded-xl max-md:before:inset-x-[-8px] max-md:before:inset-y-1.5",
        "hover:before:bg-surface-muted/65",
      )}
      data-followed-project={project.id}
      data-unread={unread > 0 || undefined}
    >
      <div className="min-w-0 flex-1">
        <p className={cn(meta, "gap-1")}>
          <MapPin size={13} className="shrink-0" aria-hidden="true" />
          <span className="min-w-0 truncate">{projectPlace(project)}</span>
        </p>
        {/* Stretched over the whole row; the menu button sits above it. */}
        <button
          type="button"
          className={cn(
            "mt-1 block max-w-full truncate text-left text-item leading-5.5 text-ink outline-none",
            "after:absolute after:inset-x-[-12px] after:inset-y-2 after:rounded-xl max-md:after:inset-x-[-8px] max-md:after:inset-y-1.5",
            "focus-visible:after:outline-2 focus-visible:after:outline-focus",
          )}
          data-press=""
          onClick={() => onOpen(project.id, summary.first ?? {})}
        >
          {project.title}
        </button>
        <p className={cn(meta, "mt-1 gap-1.5")}>
          <span className="inline-flex shrink-0 items-center gap-1.5 font-medium text-ink">
            <i
              className={cn(
                "size-2 shrink-0 rounded-full",
                statusTone[project.status].dot,
              )}
            />
            {/* Phones keep just the dot when there is news to fit. */}
            <span className={cn(unread > 0 && "max-md:sr-only")}>
              {status.label}
            </span>
          </span>
          {unread > 0 ? (
            <span
              className={cn(
                separator,
                "truncate font-medium text-accent-strong max-md:before:hidden",
              )}
            >
              {unreadSummary(summary)}
            </span>
          ) : summary.latest ? (
            <RelativeTime
              date={summary.latest}
              mode="relative"
              className={cn(separator, "truncate")}
            />
          ) : null}
        </p>
      </div>
      {/* As tall as the text beside it, at 4:3, as in the project list. */}
      {hasPhoto(project) && (
        <div className="relative h-16.5 w-22 shrink-0 overflow-hidden rounded-lg bg-surface-muted">
          <Image
            src={project.image}
            alt=""
            fill
            sizes="88px"
            className="object-cover"
          />
        </div>
      )}
      <Menu.Root>
        <Menu.Trigger
          className={cn(
            // No fill: the dots brighten on hover, like the list's counts.
            "relative z-1 -mr-2.5 grid size-10 shrink-0 place-items-center rounded-lg text-muted outline-none",
            "transition-colors duration-150 hover:text-ink data-popup-open:text-ink motion-reduce:transition-none",
            "focus-visible:outline-2 focus-visible:outline-focus",
          )}
          aria-label={`Valg for ${project.title}`}
          data-tooltip="Valg"
        >
          <Ellipsis size={18} aria-hidden="true" />
        </Menu.Trigger>
        <Menu.Portal>
          <Menu.Positioner
            side="bottom"
            align="end"
            sideOffset={2}
            className="z-[1000]"
          >
            <Menu.Popup className="min-w-44 rounded-xl border border-border bg-surface p-1.5 text-ui shadow-popover outline-none motion-safe:animate-menu-enter">
              <Menu.Item
                className="flex min-h-9 cursor-default items-center gap-2 rounded-lg px-2.5 py-1.5 text-ink outline-none select-none data-highlighted:bg-surface-muted pointer-coarse:min-h-11"
                onClick={() => onUnfollow(project.id)}
              >
                <BellOff size={14} className="text-muted" aria-hidden="true" />
                Slutt å følge
              </Menu.Item>
            </Menu.Popup>
          </Menu.Positioner>
        </Menu.Portal>
      </Menu.Root>
    </li>
  );
}

/**
 * The projects a user follows, one row each with what is new since they last
 * opened it. Self-contained inside a titled `Panel`: give it the data and
 * callbacks and it lays out its own header, sorting and scrolling list.
 */
export default function FollowedProjects({
  projects,
  followingIds,
  following,
  onOpen,
  onUnfollow,
}: {
  /** All projects, to look the followed ones up in. */
  projects: Project[];
  /** What the user follows; rows show even before their counts arrive. */
  followingIds: string[];
  following: Following | null;
  onOpen: (projectId: string, target: FollowedTarget) => void;
  onUnfollow: (projectId: string) => void;
}) {
  const [sort, setSort] = useState<"activity" | "title">("activity");
  const rows = useMemo(() => {
    const byId = new Map(projects.map((project) => [project.id, project]));
    const counts = new Map(
      (following?.projects ?? []).map((item) => [item.projectId, item]),
    );
    const list: Row[] = followingIds.flatMap((id) => {
      const project = byId.get(id);
      return project
        ? [
            {
              project,
              summary: counts.get(id) ?? {
                projectId: id,
                latest: undefined,
                comments: 0,
                replies: 0,
                updates: 0,
              },
            },
          ]
        : [];
    });
    return list.sort((a, b) =>
      sort === "title"
        ? a.project.title.localeCompare(b.project.title, "nb")
        : compareFollowed(a.summary, b.summary),
    );
  }, [following, followingIds, projects, sort]);
  const unread = rows.filter((row) => unreadCount(row.summary) > 0).length;

  return (
    <section
      className="flex min-h-0 flex-1 flex-col"
      aria-labelledby="followed-projects-title"
      data-followed-projects=""
    >
      <PanelHeader
        id="followed-projects-title"
        title="Følger"
        badge={unread > 0 && <UnreadBadge count={unread} />}
        actions={
          rows.length > 1 && (
            <ChoiceSelect
              label="Sorter fulgte prosjekter"
              value={sort}
              className={cn(sortChoice, "mr-0")}
              icon={<ArrowDownUp size={14} />}
              onChange={(value) => setSort(value as typeof sort)}
              options={[
                { value: "activity", label: "Aktivitet" },
                { value: "title", label: "Alfabetisk" },
              ]}
            />
          )
        }
      />
      <div
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4.5 pb-8 scrollbar-thin md:px-gutter-scroll"
        data-followed-scroll=""
        data-drawer-scroll
      >
        {rows.length === 0 ? (
          <EmptyState
            level={2}
            icon={<Bell size={22} />}
            title="Følger ingen prosjekter"
          />
        ) : (
          <ol className="pt-1" aria-label="Fulgte prosjekter">
            {rows.map((row) => (
              <FollowedRow
                key={row.project.id}
                {...row}
                onOpen={onOpen}
                onUnfollow={onUnfollow}
              />
            ))}
          </ol>
        )}
      </div>
    </section>
  );
}
