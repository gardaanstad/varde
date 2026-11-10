"use client";
import { useSyncExternalStore } from "react";
import SuggestionList from "./suggestion-list";
import { useCommunity } from "./community-provider";

const mobileQuery = "(width < 48rem)";
function subscribe(callback: () => void) {
  const media = window.matchMedia(mobileQuery);
  media.addEventListener("change", callback);
  return () => media.removeEventListener("change", callback);
}

/** Phones: the suggestion list as a page over the explorer. */
export default function SuggestionsRoute({
  mobileHint,
  ...props
}: {
  moderator: boolean;
  mobileHint: boolean;
}) {
  const { refresh } = useCommunity();
  const mobile = useSyncExternalStore(
    subscribe,
    () => window.matchMedia(mobileQuery).matches,
    () => mobileHint,
  );
  if (!mobile) return null;
  return (
    <div className="fixed inset-0 z-[1000] overflow-y-auto bg-canvas">
      <SuggestionList
        {...props}
        onChange={() => void refresh().catch(() => {})}
      />
    </div>
  );
}
