import { suggestionMutationSchema } from "@/app/lib/suggestions";
import { throttle } from "@/app/lib/server/community";
import {
  api,
  HttpError,
  moderates,
  json,
  readBody,
  requireUser,
} from "@/app/lib/server/http";
import {
  approveSuggestion,
  markSeen,
  readSuggestions,
  rejectSuggestion,
  submitSuggestion,
} from "@/app/lib/server/suggestions";

export function GET(request: Request) {
  return api(async () => {
    const member = await requireUser(request);
    const lists = await readSuggestions(
      member.id,
      moderates(member, request.headers),
    );
    // Opening the list marks reviews as seen, after reading them as new.
    if (new URL(request.url).searchParams.has("seen"))
      await markSeen(member.id);
    return json(lists);
  });
}

export function POST(request: Request) {
  return api(async () => {
    const body = suggestionMutationSchema.parse(await readBody(request));
    const member = await requireUser(request);
    const moderator = moderates(member, request.headers);
    await throttle(member.id);
    if (body.action === "submit") {
      // Moderators change projects directly.
      if (moderator)
        throw new HttpError(400, "Moderatorer endrer prosjekter direkte.");
      await submitSuggestion(member.id, body.suggestion);
      return json(await readSuggestions(member.id, false), 201);
    }
    if (!moderator)
      throw new HttpError(403, "Bare moderatorer kan behandle forslag.");
    if (body.action === "approve") await approveSuggestion(member.id, body);
    else await rejectSuggestion(member.id, body.id, body.reason);
    return json(await readSuggestions(member.id, true));
  });
}
