"use client";
import { useEffect, useMemo, useState } from "react";
import { Bell, Megaphone, MessageCircle, Reply } from "lucide-react";
import type { Project } from "../lib/data";
import {
  type Feed,
  type FeedItem,
  groupFeed,
  visibleGroupItems,
} from "../lib/feed";
import { cn } from "../lib/cn";
import CategoryIcon from "./category-icon";
import EmptyState from "./empty-state";
import RelativeTime from "./relative-time";

export type FeedTarget = {
  projectId: string;
  updateId?: string;
  commentId?: string;
};

const rowText =
  "text-ui leading-[1.45] decoration-border-strong underline-offset-3 group-hover:underline";

/**
 * Keys that were unread when the feed was opened, plus any that arrive while
 * it stays open, so items keep their mark after the feed is marked as seen.
 */
export function useFreshKeys(feed: Feed | null) {
  const unreadKeys = (current: Feed | null) =>
    (current?.items ?? [])
      .filter((item) => item.unread)
      .map((item) => item.key);
  const [fresh, setFresh] = useState(() => new Set(unreadKeys(feed)));
  const [read, setRead] = useState(feed);
  if (feed !== read) {
    setRead(feed);
    const added = unreadKeys(feed).filter((key) => !fresh.has(key));
    if (added.length) setFresh(new Set([...fresh, ...added]));
  }
  return fresh;
}

function FeedRow({
  item,
  fresh,
  compact,
  onOpen,
}: {
  item: FeedItem;
  fresh: boolean;
  compact: boolean;
  onOpen: (target: FeedTarget) => void;
}) {
  const Icon =
    item.kind === "update"
      ? Megaphone
      : item.kind === "reply"
        ? Reply
        : MessageCircle;
  return (
    <li>
      <button
        type="button"
        className={cn(
          "group relative grid w-full grid-cols-[14px_minmax(0,1fr)] gap-x-2.5 gap-y-0.5 text-left",
          compact
            ? "py-2"
            : "-mx-2 w-[calc(100%+16px)] rounded-lg px-2 py-2.25 hover:bg-ink/[0.035]",
          "[&>svg]:row-span-2 [&>svg]:mt-0.75",
        )}
        data-feed-item={item.key}
        data-unread={fresh || undefined}
        onClick={() =>
          onOpen({
            projectId: item.projectId,
            updateId: item.updateId,
            commentId: item.commentId,
          })
        }
      >
        <Icon
          size={14}
          aria-hidden="true"
          className={item.kind === "comment" ? "text-muted" : "text-accent"}
        />
        {item.kind === "update" ? (
          <strong className={cn(rowText, "font-[550] text-ink")}>
            <span className="sr-only">Oppdatering: </span>
            {item.text}
          </strong>
        ) : (
          <span
            className={cn(rowText, "line-clamp-2 wrap-anywhere text-ink-soft")}
          >
            <b className="font-[550] text-ink">{item.author}</b>
            {item.kind === "reply" && (
              <span className="text-muted"> svarte deg</span>
            )}{" "}
            {item.text}
          </span>
        )}
        <span className="col-start-2 flex items-center gap-1.5 text-xs leading-4 text-muted">
          {fresh && (
            <span
              className="size-1.5 shrink-0 rounded-full bg-accent"
              aria-label="Ny"
              role="img"
            />
          )}
          <RelativeTime date={item.date} mode="relative" />
        </span>
      </button>
    </li>
  );
}

/** Activity grouped by project, the most recently active project first. */
export default function ActivityFeed({
  feed,
  projects,
  fresh,
  compact = false,
  maxGroups,
  onOpen,
}: {
  feed: Feed;
  projects: Project[];
  fresh: ReadonlySet<string>;
  /** The narrow aside: fewer rows per project, no row backgrounds. */
  compact?: boolean;
  maxGroups?: number;
  onOpen: (target: FeedTarget) => void;
}) {
  const groups = useMemo(() => {
    const byId = new Map(projects.map((project) => [project.id, project]));
    return groupFeed(feed.items).flatMap((group) => {
      const project = byId.get(group.projectId);
      return project ? [{ ...group, project }] : [];
    });
  }, [feed.items, projects]);
  return (
    <ol aria-label="Aktivitet">
      {groups.slice(0, maxGroups).map((group) => {
        const { shown, hidden } = visibleGroupItems(group, compact ? 1 : 3);
        const rows = compact ? shown.slice(0, 2) : shown;
        const more = hidden + shown.length - rows.length;
        return (
          <li
            key={group.projectId}
            className={cn(
              "border-b border-border last:border-b-0",
              compact ? "py-2.5" : "py-4",
            )}
            aria-label={group.project.title}
          >
            <button
              type="button"
              className={cn(
                "flex max-w-full min-w-0 items-center gap-1.5 text-left text-ink hover:text-accent [&>svg]:shrink-0 [&>svg]:text-muted",
                compact
                  ? "text-xs font-semibold"
                  : "text-sm font-[620] tracking-[-0.1px]",
              )}
              onClick={() => onOpen({ projectId: group.projectId })}
            >
              <CategoryIcon
                category={group.project.category}
                size={compact ? 13 : 15}
              />
              <span className="truncate">{group.project.title}</span>
            </button>
            <ol className={compact ? "mt-0.5" : "mt-1.5"}>
              {rows.map((item) => (
                <FeedRow
                  key={item.key}
                  item={item}
                  fresh={fresh.has(item.key)}
                  compact={compact}
                  onOpen={onOpen}
                />
              ))}
              {more > 0 && (
                <li>
                  <button
                    type="button"
                    className={cn(
                      "min-h-8 text-xs font-medium text-muted hover:text-ink hover:underline hover:underline-offset-3",
                      compact ? "" : "pl-6",
                    )}
                    onClick={() => onOpen({ projectId: group.projectId })}
                  >
                    {compact
                      ? `+${more} til`
                      : `+${more} ${more === 1 ? "kommentar" : "kommentarer"}`}
                  </button>
                </li>
              )}
            </ol>
          </li>
        );
      })}
    </ol>
  );
}

/** An accent count for unread activity; caps at 99+. */
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
      aria-label={`${count} nye`}
      role="img"
      data-unread-badge=""
    >
      {count > 99 ? "99+" : count}
    </span>
  );
}

/**
 * The full feed. Opening it marks everything read, and so does each read
 * that arrives while it stays open; the marks stay for the visit.
 */
export function FollowingActivity({
  feed,
  projects,
  markSeen,
  onOpen,
}: {
  feed: Feed;
  projects: Project[];
  markSeen: () => Promise<void>;
  onOpen: (target: FeedTarget) => void;
}) {
  const fresh = useFreshKeys(feed);
  useEffect(() => {
    if (feed.unread > 0 && !document.hidden) void markSeen();
  }, [feed, markSeen]);
  if (feed.items.length === 0)
    return (
      <EmptyState level={2} icon={<Bell size={22} />} title="Ingen aktivitet" />
    );
  return (
    <ActivityFeed
      feed={feed}
      projects={projects}
      fresh={fresh}
      onOpen={onOpen}
    />
  );
}

/** The desktop aside for signed-in users: the newest of their feed. */
export function PersonalActivity({
  feed,
  projects,
  onOpen,
  onShowAll,
}: {
  feed: Feed;
  projects: Project[];
  onOpen: (target: FeedTarget) => void;
  onShowAll: () => void;
}) {
  const unread = useMemo(
    () =>
      new Set(feed.items.filter((item) => item.unread).map((item) => item.key)),
    [feed.items],
  );
  return (
    <div>
      <div className="mb-1 flex items-center gap-2">
        <h2
          id="recent-activity"
          className="text-sm leading-normal font-semibold text-ink"
        >
          Følger
        </h2>
        {feed.unread > 0 && <UnreadBadge count={feed.unread} />}
        <button
          type="button"
          className="-mr-1.5 ml-auto min-h-8 rounded-md px-1.5 text-xs font-medium text-muted hover:bg-ink/[0.05] hover:text-ink"
          onClick={onShowAll}
        >
          Vis alle
        </button>
      </div>
      {feed.items.length === 0 ? (
        <p className="py-3 text-ui text-muted">Ingen aktivitet</p>
      ) : (
        <ActivityFeed
          feed={feed}
          projects={projects}
          fresh={unread}
          compact
          maxGroups={6}
          onOpen={onOpen}
        />
      )}
    </div>
  );
}
