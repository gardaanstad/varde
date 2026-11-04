import Link from "next/link";
import { redirect } from "next/navigation";
import { getPageSession } from "../lib/auth";
import {
  authBackHref,
  safeReturnPath,
  welcomeHref,
} from "../lib/account-rules";
import AuthShell from "../components/auth-shell";
import GoogleSignIn from "../components/google-sign-in";
export const metadata = { title: "Logg inn · Varde" };
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string; reauth?: string }>;
}) {
  const params = await searchParams;
  const next = safeReturnPath(params.next);
  const session = await getPageSession();
  if (session && !params.reauth)
    redirect(session.user.username ? next : welcomeHref(next));
  return (
    <AuthShell back={authBackHref(next)}>
      <h1 className="text-2xl leading-tight font-semibold tracking-tight text-ink">
        Logg inn
      </h1>
      <p className="mt-2 mb-6 text-sm leading-6 text-muted">
        Lagre prosjekter og delta i diskusjonene.
      </p>
      {params.error && (
        <p
          role="alert"
          className="mb-4 rounded-lg bg-danger-soft p-3 text-sm leading-6 text-danger"
        >
          Innloggingen ble avbrutt eller kunne ikke fullføres. Prøv igjen når du
          er klar.
        </p>
      )}
      {params.reauth && (
        <p className="mb-4 text-sm leading-6 text-muted">
          Bekreft Google-kontoen din på nytt for å administrere kontoen.
        </p>
      )}
      <GoogleSignIn next={next} reauthenticate={!!params.reauth} />
      <p className="mt-5 text-center text-xs leading-5 text-muted">
        Nye brukere velger et offentlig brukernavn. Navn og e-post fra Google
        vises ikke.{" "}
        <Link href="/personvern" className="underline hover:text-ink">
          Personvern
        </Link>
      </p>
    </AuthShell>
  );
}
