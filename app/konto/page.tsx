import { redirect } from "next/navigation";
import { getPageSession } from "../lib/auth";
import AccountSettings from "../components/account-settings";
import AuthShell from "../components/auth-shell";
import { profileHref } from "../lib/profiles";
import { loginHref, welcomeHref } from "../lib/account-rules";
export const metadata = { title: "Kontoinnstillinger · Varde" };
export default async function AccountPage() {
  const session = await getPageSession();
  if (!session) redirect(loginHref("/konto"));
  if (!session.user.username) redirect(welcomeHref("/konto"));
  return (
    <AuthShell back={profileHref(session.user.username)}>
      <AccountSettings user={session.user} />
    </AuthShell>
  );
}
