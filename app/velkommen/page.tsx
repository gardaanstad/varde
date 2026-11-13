import { redirect } from "next/navigation";
import { authBackHref, safeReturnPath } from "../lib/account-rules";

/** Former onboarding page: a username is now chosen over the page itself. */
export default async function WelcomePage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  redirect(authBackHref(safeReturnPath((await searchParams).next)));
}
