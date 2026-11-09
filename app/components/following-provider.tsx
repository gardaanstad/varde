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
import type { Following } from "../lib/following";

type FollowingContext = {
  /** Null when signed out, or until the signed-in user's counts have loaded. */
  following: Following | null;
  /** Clears one project's unread counts; a no-op when it has none. */
  markSeen: (projectId: string) => Promise<void>;
};
const Context = createContext<FollowingContext | null>(null);

/**
 * Unread counts for the signed-in user's followed projects. They reread
 * whenever the shared project data changes (polling, focus, the user's own
 * changes), so they need no timer of their own.
 */
export function FollowingProvider({
  children,
  initialFollowing,
  initialUserId,
}: {
  children: ReactNode;
  initialFollowing: Following | null;
  initialUserId?: string;
}) {
  const { user } = useAuth();
  const { projects, comments, following: followed } = useCommunity();
  const [state, setState] = useState({
    following: initialFollowing,
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
    async (request: () => Promise<Following>) => {
      const version = ++revision.current;
      const next = await request();
      if (identity.current === userId && revision.current === version)
        setState({ following: next, userId });
    },
    [userId],
  );
  // The first community data is what the server counted with.
  const initial = useRef({ projects, comments, followed });
  useEffect(() => {
    if (!userId) return;
    const first = initial.current;
    if (
      state.userId === userId &&
      first.projects === projects &&
      first.comments === comments &&
      first.followed === followed
    )
      return;
    void load(() => apiRequest<Following>("/api/following")).catch(() => {
      /* Keep the last successful read. */
    });
    // state.userId only tells whether the first read is still current.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [load, userId, projects, comments, followed]);

  const following = userId && state.userId === userId ? state.following : null;
  const markSeen = useCallback(
    async (projectId: string) => {
      const item = following?.projects.find(
        (entry) => entry.projectId === projectId,
      );
      if (!following || !item?.first || marking.current.has(projectId)) return;
      marking.current.add(projectId);
      try {
        await load(() =>
          apiRequest<Following>("/api/following", {
            method: "POST",
            body: JSON.stringify({
              action: "seen",
              projectId,
              readAt: following.readAt,
            }),
          }),
        );
      } catch {
        /* The counts stay until the next successful read. */
      } finally {
        marking.current.delete(projectId);
      }
    },
    [following, load],
  );

  return (
    <Context.Provider value={{ following, markSeen }}>
      {children}
    </Context.Provider>
  );
}
export function useFollowing() {
  const context = useContext(Context);
  if (!context) throw new Error("useFollowing requires FollowingProvider");
  return context;
}
