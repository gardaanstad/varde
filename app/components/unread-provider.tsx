"use client";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useAuth } from "./auth-provider";
import { useCommunity } from "./community-provider";
import { apiRequest } from "../lib/api-client";
import { type ProjectNews, type Unread, unreadCount } from "../lib/unread";

type UnreadContext = {
  /** What is new on each opened project; empty when signed out. */
  news: ReadonlyMap<string, ProjectNews>;
  /**
   * Records that a project was opened and read. A no-op for one already
   * opened with nothing new, and until the first read has loaded.
   */
  markSeen: (projectId: string) => Promise<void>;
};
const Context = createContext<UnreadContext | null>(null);
const none: ReadonlyMap<string, ProjectNews> = new Map();

/**
 * Entries that didn't change keep their identity, so a reread only renders
 * the cards whose counts moved.
 */
function reuse(current: Unread | null, next: Unread): Unread {
  const last = new Map(current?.projects.map((item) => [item.projectId, item]));
  return {
    ...next,
    projects: next.projects.map((item) => {
      const old = last.get(item.projectId);
      return old && JSON.stringify(old) === JSON.stringify(item) ? old : item;
    }),
  };
}

/**
 * Unread counts for every project the signed-in user has opened. They reread
 * whenever the shared project data changes (polling, focus, the user's own
 * changes), so they need no timer of their own.
 */
export function UnreadProvider({
  children,
  initialUnread,
  initialUserId,
}: {
  children: ReactNode;
  initialUnread: Unread | null;
  initialUserId?: string;
}) {
  const { user } = useAuth();
  const { projects, comments } = useCommunity();
  const [state, setState] = useState({
    unread: initialUnread,
    userId: initialUserId,
  });
  const userId = user?.username ? user.id : undefined;
  const identity = useRef(userId);
  const revision = useRef(0);
  const marking = useRef(new Set<string>());
  useEffect(() => {
    identity.current = userId;
  }, [userId]);

  const load = useCallback(
    async (request: () => Promise<Unread>) => {
      const version = ++revision.current;
      const next = await request();
      if (identity.current === userId && revision.current === version)
        setState((state) => ({
          unread: state.userId === userId ? reuse(state.unread, next) : next,
          userId,
        }));
    },
    [userId],
  );
  // The first community data is what the server counted with.
  const initial = useRef({ projects, comments });
  useEffect(() => {
    if (!userId) return;
    const first = initial.current;
    if (
      state.userId === userId &&
      first.projects === projects &&
      first.comments === comments
    )
      return;
    void load(() => apiRequest<Unread>("/api/seen")).catch(() => {
      /* Keep the last successful read. */
    });
    // state.userId only tells whether the first read is still current.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [load, userId, projects, comments]);

  const unread = userId && state.userId === userId ? state.unread : null;
  const news = useMemo(
    () =>
      unread
        ? new Map(unread.projects.map((item) => [item.projectId, item]))
        : none,
    [unread],
  );
  const markSeen = useCallback(
    async (projectId: string) => {
      if (!unread || marking.current.has(projectId)) return;
      const item = news.get(projectId);
      if (item && unreadCount(item) === 0) return;
      marking.current.add(projectId);
      try {
        await load(() =>
          apiRequest<Unread>("/api/seen", {
            method: "POST",
            body: JSON.stringify({
              action: "seen",
              projectId,
              readAt: unread.readAt,
            }),
          }),
        );
      } catch {
        /* The counts stay until the next successful read. */
      } finally {
        marking.current.delete(projectId);
      }
    },
    [unread, news, load],
  );

  return (
    <Context.Provider value={{ news, markSeen }}>{children}</Context.Provider>
  );
}
export function useUnread() {
  const context = useContext(Context);
  if (!context) throw new Error("useUnread requires UnreadProvider");
  return context;
}
