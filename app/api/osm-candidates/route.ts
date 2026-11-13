import { z } from "zod";
import {
  api,
  HttpError,
  isModerator,
  json,
  readBody,
  requireUser,
} from "@/app/lib/server/http";
import {
  dismissOsm,
  readOsmFeed,
  refreshOsmFeed,
} from "@/app/lib/server/osm-candidates";

// Reading OSM can take a couple of minutes when Overpass is busy.
export const maxDuration = 300;

async function requireModerator(request: Request) {
  const member = await requireUser(request);
  if (!isModerator(member))
    throw new HttpError(403, "Bare moderatorer har tilgang.");
  return member;
}

export function GET(request: Request) {
  return api(async () => {
    await requireModerator(request);
    return json(await readOsmFeed());
  });
}

const mutation = z.discriminatedUnion("action", [
  z.object({ action: z.literal("refresh") }),
  z.object({
    action: z.literal("dismiss"),
    ids: z
      .array(z.string().regex(/^[cp]\d{1,15}$/))
      .min(1)
      .max(5000),
    dismissed: z.boolean(),
  }),
]);

export function POST(request: Request) {
  return api(async () => {
    const body = mutation.parse(await readBody(request));
    const member = await requireModerator(request);
    if (body.action === "dismiss") {
      await dismissOsm(member.id, body.ids, body.dismissed);
      return json({ ok: true });
    }
    return json(await refreshOsmFeed());
  });
}
