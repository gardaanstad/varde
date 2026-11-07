import { z } from "zod";
import { markFeedSeen, readFeed } from "@/app/lib/server/feed";
import { throttle } from "@/app/lib/server/community";
import { api, json, readBody, requireUser } from "@/app/lib/server/http";

const seenSchema = z.object({
  action: z.literal("seen"),
  readAt: z.iso.datetime(),
});
export function GET(request: Request) {
  return api(async () => {
    const member = await requireUser(request);
    return json(await readFeed(member.id));
  });
}
/** Marks the feed as read up to the read the client showed. */
export function POST(request: Request) {
  return api(async () => {
    const body = seenSchema.parse(await readBody(request));
    const member = await requireUser(request);
    await throttle(member.id);
    await markFeedSeen(member.id, body.readAt);
    return json(await readFeed(member.id));
  });
}
