import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { userAgent } from "next/server";
import { getPageSession } from "../../lib/auth";
import { loginHref, welcomeHref } from "../../lib/account-rules";
import { isModerator } from "../../lib/server/http";
import SuggestionsRoute from "../../components/suggestions-route";

export const metadata = { title: "Forslag · Varde" };

// Desktop shows the list as a sidebar panel in the explorer; phones get it as
// a page over the explorer. Either loads it (and marks reviews as seen) once.
export default async function SuggestionsPage() {
  const session = await getPageSession();
  if (!session) redirect(loginHref("/forslag"));
  if (!session.user.username) redirect(welcomeHref("/forslag"));
  const { device } = userAgent({ headers: await headers() });
  return (
    <SuggestionsRoute
      moderator={isModerator(session.user)}
      mobileHint={device.type === "mobile"}
    />
  );
}
