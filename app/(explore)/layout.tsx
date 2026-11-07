import type { ReactNode } from "react";
import { headers } from "next/headers";
import { userAgent } from "next/server";
import { getPageSession } from "../lib/auth";
import { readCommunity } from "../lib/server/community";
import { isModerator } from "../lib/server/http";
import { CommunityProvider } from "../components/community-provider";
import ExplorerShell from "../components/explorer-shell";

export default async function ExploreLayout({
  children,
}: {
  children: ReactNode;
}) {
  const session = await getPageSession();
  // Phones get the mobile layout in the first HTML, so it doesn't swap after load.
  const { device } = userAgent({ headers: await headers() });
  return (
    <CommunityProvider
      initialData={await readCommunity(
        session?.user.id,
        !!session && isModerator(session.user),
      )}
      initialUserId={session?.user.id}
    >
      <ExplorerShell mobileHint={device.type === "mobile"} />
      {children}
    </CommunityProvider>
  );
}
