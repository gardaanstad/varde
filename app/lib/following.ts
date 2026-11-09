/**
 * What is new on each project a user follows since they last opened it. The
 * server counts it (app/lib/server/following.ts); the list, the nav badge and
 * the project page all read the same counts, so they always agree.
 */
export type FollowedProject = {
  projectId: string;
  /** Newest update or comment on the project by anyone, for sorting. */
  latest?: string;
  /** Unread comments by others, not counting replies to the user. */
  comments: number;
  /** Unread replies to the user's own comments. */
  replies: number;
  /** Unread project updates. */
  updates: number;
  /** The oldest unread item, where the project opens. */
  first?: { updateId?: string; commentId?: string };
};

export type Following = {
  projects: FollowedProject[];
  /** Server time of this read; marking a project seen covers up to here. */
  readAt: string;
};

export function unreadCount(project: FollowedProject) {
  return project.comments + project.replies + project.updates;
}

/** The nav badge: how many followed projects have something unread. */
export function unreadProjects(following: Following | null) {
  return (following?.projects ?? []).filter((item) => unreadCount(item) > 0)
    .length;
}

/** "3 nye kommentarer · 1 oppdatering · 1 svar til deg". */
export function unreadSummary(project: FollowedProject) {
  const { comments, updates, replies } = project;
  return [
    comments > 0 &&
      `${comments} ${comments === 1 ? "ny kommentar" : "nye kommentarer"}`,
    updates > 0 &&
      `${updates} ${updates === 1 ? "oppdatering" : "oppdateringer"}`,
    replies > 0 && `${replies} svar til deg`,
  ]
    .filter(Boolean)
    .join(" · ");
}

const time = (date?: string) => (date ? Date.parse(date) || 0 : 0);

/** Projects with unread activity first, then by latest activity. */
export function compareFollowed(a: FollowedProject, b: FollowedProject) {
  return (
    Number(unreadCount(b) > 0) - Number(unreadCount(a) > 0) ||
    time(b.latest) - time(a.latest)
  );
}
