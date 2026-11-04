import "server-only";
import { ZodError } from "zod";
import { readSession, siteURL } from "../auth";

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export function json(data: unknown, status = 200) {
  return Response.json(data, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
}
export async function api(action: () => Promise<Response>) {
  try {
    return await action();
  } catch (error) {
    if (error instanceof HttpError)
      return json({ error: error.message }, error.status);
    if (error instanceof ZodError)
      return json(
        {
          error:
            error.issues[0]?.message || "Kontroller feltene og prøv igjen.",
        },
        400,
      );
    console.error(
      "Application request failed",
      error instanceof Error ? error.message : "Unknown error",
    );
    return json(
      { error: "Kunne ikke lagre endringen. Prøv igjen om litt." },
      500,
    );
  }
}
export async function readBody(request: Request) {
  if (!request.headers.get("content-type")?.startsWith("application/json"))
    throw new HttpError(415, "Ugyldig forespørsel.");
  // All application mutations require the configured origin, including signed-in requests.
  const origin = request.headers.get("origin");
  if (origin !== new URL(siteURL()).origin)
    throw new HttpError(403, "Ugyldig forespørsel. Last siden på nytt.");
  const body = await request.text();
  if (body.length > 100_000)
    throw new HttpError(413, "Innholdet er for stort.");
  try {
    return JSON.parse(body);
  } catch {
    throw new HttpError(400, "Ugyldig forespørsel.");
  }
}
export async function requireUser(request: Request, onboarded = true) {
  const session = await readSession(request.headers);
  if (!session) throw new HttpError(401, "Logg inn for å fortsette.");
  if (!session.user.emailVerified)
    throw new HttpError(
      403,
      "Google-kontoen må ha en bekreftet e-postadresse.",
    );
  if (onboarded && !session.user.username)
    throw new HttpError(403, "Velg et brukernavn først.");
  return session.user;
}
export function isModerator(user: { email: string; emailVerified: boolean }) {
  return (
    user.emailVerified &&
    (process.env.MODERATOR_EMAILS || "")
      .split(",")
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean)
      .includes(user.email.toLowerCase())
  );
}
