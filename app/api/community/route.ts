import { readSession } from "@/app/lib/auth";
import { mutationSchema } from "@/app/lib/community-rules";
import {
  addComment,
  castVote,
  readCommunity,
  saveProject,
  setSaved,
  throttle,
} from "@/app/lib/server/community";
import {
  api,
  HttpError,
  moderates,
  json,
  readBody,
  requireUser,
} from "@/app/lib/server/http";
export function GET(request: Request) {
  return api(async () => {
    const session = await readSession(request.headers);
    return json(
      await readCommunity(
        session?.user.id,
        !!session && moderates(session.user, request.headers),
      ),
    );
  });
}
export function POST(request: Request) {
  return api(async () => {
    const body = mutationSchema.parse(await readBody(request));
    const member = await requireUser(request);
    await throttle(member.id);
    switch (body.action) {
      case "project":
        if (!moderates(member, request.headers))
          throw new HttpError(403, "Bare moderatorer kan endre prosjekter.");
        await saveProject(body.project, body.create);
        break;
      case "vote":
        await castVote(member.id, body.commentId, body.value);
        break;
      case "save":
        await setSaved(member.id, body.projectId, body.saved);
        break;
      case "comment":
        await addComment(member.id, body);
        break;
    }
    return json(
      await readCommunity(member.id, moderates(member, request.headers)),
    );
  });
}
