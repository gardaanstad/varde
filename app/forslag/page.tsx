import { redirect } from "next/navigation";
import { getPageSession } from "../lib/auth";
import { loginHref, welcomeHref } from "../lib/account-rules";
import { isModerator } from "../lib/server/http";
import { markSeen, readSuggestions } from "../lib/server/suggestions";
import SuggestionList from "../components/suggestion-list";

export const metadata = { title: "Forslag · Varde" };

export default async function SuggestionsPage() {
  const session = await getPageSession();
  if (!session) redirect(loginHref("/forslag"));
  if (!session.user.username) redirect(welcomeHref("/forslag"));
  const moderator = isModerator(session.user);
  // Read first, so reviews new to the member are still marked as new.
  const lists = await readSuggestions(session.user.id, moderator);
  await markSeen(session.user.id);
  return <SuggestionList initial={lists} moderator={moderator} />;
}
