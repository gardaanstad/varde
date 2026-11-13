import { z } from "zod";
import { markProjectSeen, readUnread } from "@/app/lib/server/unread";
import { throttle } from "@/app/lib/server/community";
import { api, json, readBody, requireUser } from "@/app/lib/server/http";

const seenSchema = z.object({
  action: z.literal("seen"),
  projectId: z.string().min(1).max(100),
  readAt: z.iso.datetime(),
});
/** What is new on each project the member has opened. */
export function GET(request: Request) {
  return api(async () => {
    const member = await requireUser(request);
    return json(await readUnread(member.id));
  });
}
/** Marks one project opened, read up to the read the client showed. */
export function POST(request: Request) {
  return api(async () => {
    const body = seenSchema.parse(await readBody(request));
    const member = await requireUser(request);
    // Every opened project lands here, so it has its own, wider allowance.
    await throttle(member.id, { key: `seen:${member.id}`, limit: 120 });
    await markProjectSeen(member.id, body.projectId, body.readAt);
    return json(await readUnread(member.id));
  });
}
