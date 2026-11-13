import type { ReactNode } from "react";
import { headers } from "next/headers";
import { userAgent } from "next/server";
import { getPageSession } from "../lib/auth";
import { readCommunity } from "../lib/server/community";
import { readFollowing } from "../lib/server/following";
import { moderates } from "../lib/server/http";
import { CommunityProvider } from "../components/community-provider";
import { FollowingProvider } from "../components/following-provider";
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
  const requestHeaders = await headers();
  const { device } = userAgent({ headers: requestHeaders });
  const [community, following] = await Promise.all([
    readCommunity(userId, !!session && moderates(session.user, requestHeaders)),
    member ? readFollowing(member) : null,
  ]);
  return (
    <CommunityProvider initialData={community} initialUserId={userId}>
      <FollowingProvider initialFollowing={following} initialUserId={member}>
        <ExplorerShell mobileHint={device.type === "mobile"} />
        {children}
        <UsernamePrompt />
      </FollowingProvider>
    </CommunityProvider>
  );
}
