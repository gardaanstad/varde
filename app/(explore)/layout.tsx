import type { ReactNode } from "react";
import { headers } from "next/headers";
import { userAgent } from "next/server";
import { getPageSession } from "../lib/auth";
import { readCommunity } from "../lib/server/community";
import { readUnread } from "../lib/server/unread";
import { isModerator } from "../lib/server/http";
import { CommunityProvider } from "../components/community-provider";
import { UnreadProvider } from "../components/unread-provider";
import ExplorerShell from "../components/explorer-shell";
import UsernamePrompt from "../components/username-prompt";

export default async function ExploreLayout({
  children,
}: {
  children: ReactNode;
}) {
  const session = await getPageSession();
  const userId = session?.user.id;
  const member = session?.user.username ? userId : undefined;
  // Phones get the mobile layout in the first HTML, so it doesn't swap after load.
  const { device } = userAgent({ headers: await headers() });
  const [community, unread] = await Promise.all([
    readCommunity(userId, !!session && isModerator(session.user)),
    member ? readUnread(member) : null,
  ]);
  return (
    <CommunityProvider initialData={community} initialUserId={userId}>
      <UnreadProvider initialUnread={unread} initialUserId={member}>
        <ExplorerShell mobileHint={device.type === "mobile"} />
        {children}
        <UsernamePrompt />
      </UnreadProvider>
    </CommunityProvider>
  );
}
