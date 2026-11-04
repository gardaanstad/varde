import type { Comment } from "./data";

export type DiscussionSort = "relevant" | "newest" | "top";

/**
 * Replies keep their parent visible, even when only recent activity or one
 * update's references are requested. "relevant" lists threads active since
 * `latest` (the newest project update) first, then the rest; both by votes.
 */
export function discussionThreads(
  comments: Comment[],
  sort: DiscussionSort,
  {
    since,
    latest,
    updateId,
  }: {
    /** Only threads with activity at or after this time. */
    since?: string;
    /** The newest project update; "relevant" ranks activity after it first. */
    latest?: string;
    /** Only threads that reference this update somewhere. */
    updateId?: string;
  } = {},
) {
  const byId = new Map(comments.map((comment) => [comment.id, comment]));
  const activity = new Map<string, number>();
  const referencing = new Set<string>();
  for (const comment of comments) {
    let root = comment;
    const seen = new Set([root.id]);
    while (
      root.parentId &&
      byId.has(root.parentId) &&
      !seen.has(root.parentId)
    ) {
      root = byId.get(root.parentId)!;
      seen.add(root.id);
    }
    activity.set(
      root.id,
      Math.max(activity.get(root.id) || 0, Date.parse(comment.date)),
    );
    if (updateId && comment.updateId === updateId) referencing.add(root.id);
  }
  const sinceTime = since ? Date.parse(since) : -Infinity;
  const cutoff = latest ? Date.parse(latest) : -Infinity;
  const recent = (comment: Comment) =>
    (activity.get(comment.id) || 0) >= cutoff ? 1 : 0;
  return comments
    .filter(
      (comment) =>
        (!comment.parentId || !byId.has(comment.parentId)) &&
        (!since || (activity.get(comment.id) || 0) >= sinceTime) &&
        (!updateId || referencing.has(comment.id)),
    )
    .sort((a, b) => {
      const delta =
        sort === "relevant"
          ? recent(b) - recent(a) || b.votes - a.votes
          : sort === "top"
            ? b.votes - a.votes
            : Date.parse(b.date) - Date.parse(a.date);
      return (
        delta ||
        Date.parse(b.date) - Date.parse(a.date) ||
        a.id.localeCompare(b.id)
      );
    });
}
