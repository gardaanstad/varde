import { redirect } from "next/navigation";
import { getPageSession } from "../lib/auth";
import {
  authBackHref,
  loginHref,
  safeReturnPath,
} from "../lib/account-rules";
import AuthShell from "../components/auth-shell";
import UsernameForm from "../components/username-form";
export const metadata = { title: "Velg brukernavn · Varde" };
export default async function WelcomePage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const next = safeReturnPath((await searchParams).next);
  const session = await getPageSession();
  if (!session) redirect(loginHref(next));
  if (session.user.username) redirect(next);
  return (
    <AuthShell back={authBackHref(next)}>
      <h1 className="text-2xl leading-tight font-semibold tracking-tight text-ink">
        Hva skal vi kalle deg?
      </h1>
      <p className="mt-2 text-sm leading-6 text-muted">
        Brukernavnet vises ved kommentarene dine.
      </p>
      <UsernameForm next={next} />
    </AuthShell>
  );
}
