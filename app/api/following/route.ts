import { z } from "zod";
import { markProjectSeen, readFollowing } from "@/app/lib/server/following";
import { throttle } from "@/app/lib/server/community";
import { api, json, readBody, requireUser } from "@/app/lib/server/http";

const seenSchema = z.object({
  action: z.literal("seen"),
  projectId: z.string().min(1).max(100),
  readAt: z.iso.datetime(),
});
export function GET(request: Request) {
  return api(async () => {
    const member = await requireUser(request);
    return json(await readFollowing(member.id));
  });
}
/** Marks one followed project read, up to the read the client showed. */
export function POST(request: Request) {
  return api(async () => {
    const body = seenSchema.parse(await readBody(request));
    const member = await requireUser(request);
    await throttle(member.id);
    await markProjectSeen(member.id, body.projectId, body.readAt);
    return json(await readFollowing(member.id));
  });
}
