"use client";
import { useMemo, useState } from "react";
import Image from "next/image";
import { ArrowDownUp, ArrowLeft, Bell, BellOff } from "lucide-react";
import {
  leadCategory,
  hasPhoto,
  type Project,
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
import { iconButton, statusTone } from "../lib/ui";
import ChoiceSelect from "./choice-select";
import EmptyState from "./empty-state";
import ProjectPlaceholder from "./project-placeholder";
import RelativeTime from "./relative-time";

export type FollowedTarget = { updateId?: string; commentId?: string };

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
        "inline-grid h-4.5 min-w-4.5 place-items-center rounded-full bg-accent px-1.25 text-2xs leading-none font-semibold text-white tabular-nums",
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

const sortChoiceClasses = [
  "w-auto",
  "[&_[data-slot=choice-trigger]]:min-h-10 [&_[data-slot=choice-trigger]]:gap-1.5 [&_[data-slot=choice-trigger]]:border-transparent [&_[data-slot=choice-trigger]]:bg-transparent! [&_[data-slot=choice-trigger]]:px-2 [&_[data-slot=choice-trigger]]:text-ui [&_[data-slot=choice-trigger]]:text-muted",
  "[&_[data-slot=choice-trigger]]:hover:bg-ink/[0.05]! [&_[data-slot=choice-trigger]]:hover:text-ink",
  "[&_[data-slot=choice-menu]]:right-0 [&_[data-slot=choice-menu]]:left-auto [&_[data-slot=choice-menu]]:min-w-[180px] [&_[data-slot=choice-menu][data-open=false]]:hidden",
  "[&_[data-slot=choice-trigger]>svg:first-child]:max-md:hidden",
].join(" ");

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
        "group/row relative isolate flex items-center gap-3 border-b border-border py-2.5",
        // The hover wash bleeds past the text edge, like the project list.
        "before:absolute before:inset-x-[-10px] before:inset-y-0.5 before:-z-1 before:rounded-lg before:transition-colors before:duration-120",
        "hover:before:bg-surface-muted/65 motion-reduce:before:transition-none",
      )}
      data-followed-project={project.id}
      data-unread={unread > 0 || undefined}
    >
      <div className="relative size-11 shrink-0 overflow-hidden rounded-lg bg-surface-muted">
        {hasPhoto(project) ? (
          <Image
            src={project.image}
            alt=""
            fill
            sizes="44px"
            className="object-cover"
          />
        ) : (
          <ProjectPlaceholder
            category={leadCategory(project.categories)}
            iconSize={13}
            className="bg-size-[8px_8px] [&>span]:min-w-6.5"
          />
        )}
      </div>
      <div className="min-w-0 flex-1">
        {/* Stretched over the whole row; the unfollow button sits above it. */}
        <button
          type="button"
          className={cn(
            "block max-w-full truncate text-left text-body leading-snug font-[620] tracking-[-0.2px] text-ink outline-none",
            "after:absolute after:inset-x-[-10px] after:inset-y-0.5 after:rounded-lg focus-visible:after:outline-2 focus-visible:after:outline-focus",
          )}
          onClick={() => onOpen(project.id, summary.first ?? {})}
        >
          {project.title}
        </button>
        <p className="mt-0.5 flex min-w-0 items-center gap-1.5 text-xs leading-4 text-muted">
          <span className="inline-flex shrink-0 items-center gap-1.25 text-ink-soft">
            <span
              className={cn(
                "size-1.5 rounded-full",
                statusTone[project.status].dot,
              )}
              aria-hidden="true"
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
                "truncate font-[550] text-accent-strong max-md:before:hidden",
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
      {unread > 0 && (
        <span
          className="size-2 shrink-0 rounded-full bg-accent"
          role="img"
          aria-label="Nytt"
        />
      )}
      <button
        type="button"
        className={cn(
          iconButton,
          "relative z-1 -mr-2 size-10 shrink-0 rounded-lg text-muted hover:text-ink",
          // Mouse and trackpad: shown on hover or keyboard focus in the row.
          // Touch has no hover, so it stays visible there, muted.
          "transition-opacity duration-120 motion-reduce:transition-none",
          "pointer-fine:opacity-0 pointer-fine:group-hover/row:opacity-100 pointer-fine:group-focus-within/row:opacity-100",
        )}
        aria-label={`Slutt å følge ${project.title}`}
        data-tooltip="Slutt å følge"
        onClick={() => onUnfollow(project.id)}
      >
        <BellOff size={16} />
      </button>
    </li>
  );
}

/**
 * The projects a user follows, one row each with what is new since they last
 * opened it. Self-contained: give it the data and callbacks and it lays out
 * its own heading, sorting and list, in a page column or a side panel.
 */
export default function FollowedProjects({
  projects,
  followingIds,
  following,
  onOpen,
  onUnfollow,
  onBack,
}: {
  /** All projects, to look the followed ones up in. */
  projects: Project[];
  /** What the user follows; rows show even before their counts arrive. */
  followingIds: string[];
  following: Following | null;
  onOpen: (projectId: string, target: FollowedTarget) => void;
  onUnfollow: (projectId: string) => void;
  /** Mobile: a back button before the heading. */
  onBack?: () => void;
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
      aria-labelledby="followed-projects-title"
      data-followed-projects=""
    >
      <div className="flex min-h-14 items-center justify-between gap-3 border-b border-border py-1.5 max-md:min-h-12 max-md:pr-9">
        <div className="flex min-w-0 items-center gap-x-3">
          {onBack && (
            <button
              type="button"
              className={cn(iconButton, "-mr-2 -ml-3 rounded-lg text-muted")}
              aria-label="Tilbake"
              onClick={onBack}
            >
              <ArrowLeft size={20} />
            </button>
          )}
          <h1
            id="followed-projects-title"
            className="text-xl leading-normal font-[650] tracking-[-0.4px] max-md:text-lg"
          >
            Følger
          </h1>
          <span className="text-ui text-muted tabular-nums">{rows.length}</span>
          {unread > 0 && <UnreadBadge count={unread} />}
        </div>
        {rows.length > 1 && (
          <ChoiceSelect
            label="Sorter fulgte prosjekter"
            value={sort}
            className={sortChoiceClasses}
            icon={<ArrowDownUp size={14} />}
            onChange={(value) => setSort(value as typeof sort)}
            options={[
              { value: "activity", label: "Aktivitet" },
              { value: "title", label: "Alfabetisk" },
            ]}
          />
        )}
      </div>
      {rows.length === 0 ? (
        <EmptyState
          level={2}
          icon={<Bell size={22} />}
          title="Følger ingen prosjekter"
        />
      ) : (
        <ol aria-label="Fulgte prosjekter">
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
    </section>
  );
}
