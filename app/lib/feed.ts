/**
 * Personal activity: project updates and comments on followed projects, and
 * replies to the user's own comments. The server collects the items
 * (app/lib/server/feed.ts); grouping is shared so a later e-mail digest can
 * render the same groups as the app.
 */
export type FeedItem = {
  /** Stable across reads: `update:<id>` or `comment:<id>`. */
  key: string;
  kind: "update" | "comment" | "reply";
  projectId: string;
  date: string;
  /** Update title, or the comment text (shortened). */
  text: string;
  updateId?: string;
  commentId?: string;
  author?: string;
  unread: boolean;
};

export type Feed = {
  items: FeedItem[];
  /** Unread items in the whole window, which may be more than `items` holds. */
  unread: number;
  /** Server time the feed was read; marking it seen covers exactly this read. */
  readAt: string;
};

export type FeedGroup = {
  projectId: string;
  /** Newest first. */
  items: FeedItem[];
  latest: string;
  unread: number;
};

const time = (date: string) => Date.parse(date) || 0;

/** One group per project, the most recently active first. */
export function groupFeed(items: FeedItem[]): FeedGroup[] {
  const groups = new Map<string, FeedGroup>();
  for (const item of [...items].sort((a, b) => time(b.date) - time(a.date))) {
    const group = groups.get(item.projectId);
    if (group) {
      group.items.push(item);
      if (item.unread) group.unread += 1;
    } else
      groups.set(item.projectId, {
        projectId: item.projectId,
        items: [item],
        latest: item.date,
        unread: item.unread ? 1 : 0,
      });
  }
  return [...groups.values()];
}

/**
 * Inside a group, updates and replies always show; plain comments beyond the
 * first few fold into a count that opens the discussion.
 */
export function visibleGroupItems(group: FeedGroup, comments = 3) {
  const shown: FeedItem[] = [];
  let hidden = 0;
  let commentCount = 0;
  for (const item of group.items) {
    if (item.kind !== "comment" || commentCount++ < comments) shown.push(item);
    else hidden += 1;
  }
  return { shown, hidden };
}
