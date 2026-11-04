"use client";
// A fresh document after account changes discards the previous account's client state.
export function navigateWithFreshSession(path: string) {
  window.location.replace(new URL(path, window.location.origin).href);
}
