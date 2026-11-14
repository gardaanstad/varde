import { redirect } from "next/navigation";
import { getPageSession } from "../lib/auth";
import AccountSettings from "../components/account-settings";
import AuthShell from "../components/auth-shell";
import { loginHref } from "../lib/account-rules";
export const metadata = { title: "Kontoinnstillinger · Varde" };
export default async function AccountPage() {
  const session = await getPageSession();
  if (!session) redirect(loginHref("/konto"));
  // The explorer asks for a username first.
  if (!session.user.username) redirect("/");
  return (
    <AuthShell back={null}>
      <AccountSettings user={session.user} />
    </AuthShell>
  );
}
