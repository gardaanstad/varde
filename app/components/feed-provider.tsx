"use client";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useAuth } from "./auth-provider";
import { useCommunity } from "./community-provider";
import { apiRequest } from "../lib/api-client";
import type { Feed } from "../lib/feed";

type FeedContext = {
  /** Null when signed out, or until the signed-in user's feed has loaded. */
  feed: Feed | null;
  markSeen: () => Promise<void>;
};
const Context = createContext<FeedContext | null>(null);

/**
 * The signed-in user's activity feed. It rereads whenever the shared project
 * data changes (polling, focus, the user's own changes), so it needs no timer
 * of its own.
 */
export function FeedProvider({
  children,
  initialFeed,
  initialUserId,
}: {
  children: ReactNode;
  initialFeed: Feed | null;
  initialUserId?: string;
}) {
  const { user } = useAuth();
  const { projects, comments, following } = useCommunity();
  const [state, setState] = useState({
    feed: initialFeed,
    userId: initialUserId,
  });
  const userId = user?.username ? user.id : undefined;
  const identity = useRef(userId);
  const revision = useRef(0);
  const marking = useRef(false);
  useEffect(() => {
    identity.current = userId;
  }, [userId]);

  const load = useCallback(
    async (request: () => Promise<Feed>) => {
      const version = ++revision.current;
      const feed = await request();
      if (identity.current === userId && revision.current === version)
        setState({ feed, userId });
    },
    [userId],
  );
  // The first community data is what the server rendered the feed with.
  const initial = useRef({ projects, comments, following });
  useEffect(() => {
    if (!userId) return;
    const first = initial.current;
    if (
      state.userId === userId &&
      first.projects === projects &&
      first.comments === comments &&
      first.following === following
    )
      return;
    void load(() => apiRequest<Feed>("/api/feed")).catch(() => {
      /* Keep the last successful read. */
    });
    // state.userId only tells whether the first read is still current.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [load, userId, projects, comments, following]);

  const feed = userId && state.userId === userId ? state.feed : null;
  const readAt = feed?.readAt;
  const unread = feed?.unread ?? 0;
  const markSeen = useCallback(async () => {
    if (!readAt || unread === 0 || marking.current) return;
    marking.current = true;
    try {
      await load(() =>
        apiRequest<Feed>("/api/feed", {
          method: "POST",
          body: JSON.stringify({ action: "seen", readAt }),
        }),
      );
    } catch {
      /* The badge stays until the next successful read. */
    } finally {
      marking.current = false;
    }
  }, [load, readAt, unread]);

  return (
    <Context.Provider value={{ feed, markSeen }}>{children}</Context.Provider>
  );
}
export function useFeed() {
  const context = useContext(Context);
  if (!context) throw new Error("useFeed requires FeedProvider");
  return context;
}
