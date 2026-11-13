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
import { apiRequest } from "../lib/api-client";
import type { CommunityMutation } from "../lib/community-rules";
import type { Comment, Project } from "../lib/data";
import type { SuggestionInput, SuggestionMutation } from "../lib/suggestions";
type CommunityData = {
  projects: Project[];
  comments: Comment[];
  following: string[];
  votes: Record<string, number>;
  /** Pending suggestions: the queue for moderators, one's own otherwise. */
  suggestions: number;
  /** A member's suggestions reviewed since they last looked. */
  reviewed: number;
};
type CommunityContext = CommunityData & {
  mutate: (mutation: CommunityMutation) => Promise<void>;
  refresh: () => Promise<void>;
  /** Sends a member's suggestion to the moderation queue. */
  suggest: (suggestion: SuggestionInput) => Promise<void>;
};
const Context = createContext<CommunityContext | null>(null);
// Polling mostly returns what is already shown; keeping unchanged parts by
// reference spares the explorer and map from rebuilding on every read.
function reuse<T>(current: T, next: T) {
  return JSON.stringify(current) === JSON.stringify(next) ? current : next;
}
function merge(current: CommunityData, next: CommunityData): CommunityData {
  return {
    projects: reuse(current.projects, next.projects),
    comments: reuse(current.comments, next.comments),
    following: reuse(current.following, next.following),
    votes: reuse(current.votes, next.votes),
    suggestions: next.suggestions,
    reviewed: next.reviewed,
  };
}
export function CommunityProvider({
  children,
  initialData,
  initialUserId,
}: {
  children: ReactNode;
  initialData: CommunityData;
  initialUserId?: string;
}) {
  const { user } = useAuth();
  const [state, setState] = useState({
    data: initialData,
    userId: initialUserId,
  });
  // Follows shown before the server confirms them, by project.
  const [pendingFollows, setPendingFollows] = useState<Record<string, boolean>>(
    {},
  );
  // Each project's follows reach the server in the order they were made.
  const followQueue = useRef(new Map<string, Promise<unknown>>());
  const identity = useRef(user?.id);
  const revision = useRef(0);
  // Whose data is held: the server's render needs no immediate refetch.
  const loadedFor = useRef(initialUserId);
  useEffect(() => {
    identity.current = user?.id;
  }, [user?.id]);
  function receive(data: CommunityData, userId?: string) {
    loadedFor.current = userId;
    setState((state) => ({ data: merge(state.data, data), userId }));
  }
  const refresh = useCallback(async () => {
    const current = user?.id;
    const version = ++revision.current;
    const data = await apiRequest<CommunityData>("/api/community");
    if (identity.current === current && revision.current === version)
      receive(data, current);
  }, [user?.id]);
  useEffect(() => {
    const update = () => {
      void refresh().catch(() => {
        /* Keep the last successful read. Mutations show errors. */
      });
    };
    if (loadedFor.current !== user?.id) update();
    const updateVisible = () => {
      if (!document.hidden) update();
    };
    const timer = window.setInterval(updateVisible, 60_000);
    window.addEventListener("focus", update);
    document.addEventListener("visibilitychange", updateVisible);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", update);
      document.removeEventListener("visibilitychange", updateVisible);
    };
  }, [refresh, user?.id]);
  async function mutate(mutation: CommunityMutation) {
    const current = user?.id;
    // A follow shows at once and falls back if the server refuses it.
    const follow = mutation.action === "follow" ? mutation : null;
    if (!follow) return send(mutation, current);
    setPendingFollows((pending) => ({
      ...pending,
      [follow.projectId]: follow.following,
    }));
    const queue = followQueue.current;
    const previous = queue.get(follow.projectId);
    const request = (previous ?? Promise.resolve())
      .catch(() => {})
      .then(() => send(mutation, current));
    queue.set(follow.projectId, request);
    try {
      await request;
    } finally {
      // A later follow of the same project keeps showing until it lands.
      if (queue.get(follow.projectId) === request) {
        queue.delete(follow.projectId);
        setPendingFollows((pending) => {
          const rest = { ...pending };
          delete rest[follow.projectId];
          return rest;
        });
      }
    }
  }
  async function send(mutation: CommunityMutation, current?: string) {
    const version = ++revision.current;
    const data = await apiRequest<CommunityData>("/api/community", {
      method: "POST",
      body: JSON.stringify(mutation),
    });
    if (identity.current === current && revision.current === version)
      receive(data, current);
    else if (identity.current === current) await refresh();
  }
  const following = useMemo(() => {
    const changes = Object.entries(pendingFollows);
    if (!changes.length) return state.data.following;
    const ids = new Set(state.data.following);
    for (const [id, on] of changes) {
      if (on) ids.add(id);
      else ids.delete(id);
    }
    return [...ids];
  }, [pendingFollows, state.data.following]);
  async function suggest(suggestion: SuggestionInput) {
    await apiRequest("/api/suggestions", {
      method: "POST",
      body: JSON.stringify({
        action: "submit",
        suggestion,
      } satisfies SuggestionMutation),
    });
    // The pending count is part of the community read.
    void refresh().catch(() => {});
  }
  const personal = state.userId === user?.id && !!user;
  return (
    <Context.Provider
      value={{
        ...state.data,
        following: personal ? following : [],
        votes: personal ? state.data.votes : {},
        suggestions: personal ? state.data.suggestions : 0,
        reviewed: personal ? state.data.reviewed : 0,
        mutate,
        refresh,
        suggest,
      }}
    >
      {children}
    </Context.Provider>
  );
}
export function useCommunity() {
  const context = useContext(Context);
  if (!context) throw new Error("useCommunity requires CommunityProvider");
  return context;
}
