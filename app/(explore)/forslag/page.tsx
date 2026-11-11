import { redirect } from "next/navigation";
import { getPageSession } from "../../lib/auth";
import { loginHref, welcomeHref } from "../../lib/account-rules";

export const metadata = { title: "Forslag · Varde" };

// The explorer shows the list as a panel over itself: a sidebar layer on
// desktop, a drawer on phones. It loads it (and marks reviews as seen) once.
export default async function SuggestionsPage() {
  const session = await getPageSession();
  if (!session) redirect(loginHref("/forslag"));
  if (!session.user.username) redirect(welcomeHref("/forslag"));
  return null;
}
