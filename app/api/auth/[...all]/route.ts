import { getAuth, googleConfigured } from "@/app/lib/auth";
import { json } from "@/app/lib/server/http";
export const runtime = "nodejs";
async function handler(request: Request) {
  if (
    request.method === "POST" &&
    new URL(request.url).pathname.endsWith("/sign-in/social") &&
    !googleConfigured()
  ) {
    return json(
      {
        message:
          "Google-innlogging er ikke tilgjengelig ennå. Prøv igjen senere.",
      },
      503,
    );
  }
  return getAuth().handler(request);
}
export { handler as GET, handler as POST };
