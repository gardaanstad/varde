import { eq } from "drizzle-orm";
import { usernameSchema } from "@/app/lib/account-rules";
import { getDb } from "@/app/lib/db/client";
import { user } from "@/app/lib/db/schema";
import { claimUsername } from "@/app/lib/server/accounts";
import { api, json, readBody, requireUser } from "@/app/lib/server/http";
export function GET(request: Request) {
  return api(async () => {
    const member = await requireUser(request, false);
    const username = usernameSchema.parse(
      new URL(request.url).searchParams.get("username"),
    );
    const [owner] = await getDb()
      .select({ id: user.id })
      .from(user)
      .where(eq(user.username, username));
    return json({ available: !owner || owner.id === member.id });
  });
}
export function POST(request: Request) {
  return api(async () => {
    const body = await readBody(request);
    const member = await requireUser(request, false);
    return json({ profile: await claimUsername(member.id, body?.username) });
  });
}
