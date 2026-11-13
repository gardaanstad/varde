import { z } from "zod";

const reservedUsernames = new Set([
  "admin",
  "administrator",
  "moderator",
  "support",
  "google",
  "varde",
  "system",
  "api",
  "konto",
  "profil",
  "gjest",
  "nabolagsvenn",
  "byvandrer",
  "arkitekturinteressert",
  "oslo_på_sykkel",
]);
export const usernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(3, "Bruk minst 3 tegn.")
  .max(24, "Bruk maks 24 tegn.")
  .regex(
    /^[a-z0-9æøå][a-z0-9æøå_]*$/,
    "Bruk bokstaver, tall og understrek. Start med en bokstav eller et tall.",
  )
  .refine(
    (value) => !reservedUsernames.has(value),
    "Dette brukernavnet er reservert.",
  );
export const profileSchema = z.object({
  bio: z.string().trim().max(280),
  location: z.string().trim().max(80),
});

export function safeReturnPath(value: unknown): string {
  if (
    typeof value !== "string" ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    /[\\\x00-\x20]/.test(value)
  )
    return "/";
  try {
    const url = new URL(value, "https://varde.invalid");
    if (
      url.origin !== "https://varde.invalid" ||
      !(
        /^\/$/.test(url.pathname) ||
        /^\/prosjekt\/[^/]+$/.test(url.pathname) ||
        /^\/profil\/[^/]+$/.test(url.pathname) ||
        url.pathname === "/konto"
      )
    )
      return "/";
    return url.pathname + url.search + url.hash;
  } catch {
    return "/";
  }
}
export function loginHref(next: string = "/") {
  return `/logg-inn?next=${encodeURIComponent(safeReturnPath(next))}`;
}
/** Auth pages return to `next`, except account settings, which need an account. */
export function authBackHref(next: string) {
  return next === "/konto" ? "/" : next;
}
