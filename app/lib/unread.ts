/**
 * What is new on each project a user has opened, since they last opened it.
 * The server counts it (app/lib/server/unread.ts); the project list, the
 * saved list and the project page all read the same counts, so they agree.
 */
export type ProjectNews = {
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

export type Unread = {
  /** One entry for every project the user has opened. */
  projects: ProjectNews[];
  /** Server time of this read; marking a project seen covers up to here. */
  readAt: string;
};

export function unreadCount(project: ProjectNews) {
  return project.comments + project.replies + project.updates;
}

/** "2 nye kommentarer · 1 oppdatering · 1 svar til deg". */
export function unreadSummary(project: ProjectNews) {
  const { comments, updates, replies } = project;
  return [
    comments > 0 &&
      `${comments} ${comments === 1 ? "ny kommentar" : "nye kommentarer"}`,
    updates > 0 &&
      `${updates} ${updates === 1 ? "ny oppdatering" : "nye oppdateringer"}`,
    replies > 0 && `${replies} svar til deg`,
  ]
    .filter(Boolean)
    .join(" · ");
}
