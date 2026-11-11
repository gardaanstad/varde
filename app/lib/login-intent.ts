"use client";

/**
 * What a guest was doing when asked to log in, picked up again once they
 * return signed in. Kept for the tab only, and read once.
 */
export type LoginIntent =
  | { type: "follow"; projectId: string }
  | { type: "suggest-project" }
  | { type: "comment"; projectId: string }
  | { type: "tip"; projectId: string }
  | { type: "edit"; projectId: string };

const key = "varde-login-intent";

export function storeLoginIntent(intent: LoginIntent | undefined) {
  try {
    if (intent) sessionStorage.setItem(key, JSON.stringify(intent));
    else sessionStorage.removeItem(key);
  } catch {
    /* Sign-in still works without browser storage. */
  }
}

/** The stored intent if it matches, removing it so it runs once. */
export function takeLoginIntent<T extends LoginIntent["type"]>(
  type: T,
  projectId?: string,
): Extract<LoginIntent, { type: T }> | null {
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    const intent = JSON.parse(raw) as LoginIntent;
    if (intent.type !== type) return null;
    if (projectId && "projectId" in intent && intent.projectId !== projectId)
      return null;
    sessionStorage.removeItem(key);
    return intent as Extract<LoginIntent, { type: T }>;
  } catch {
    return null;
  }
}
