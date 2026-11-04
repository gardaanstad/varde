"use client";
import { navigateWithFreshSession } from "../lib/auth-navigation";
import {
  createContext,
  useContext,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { authClient } from "../lib/auth-client";
import { loginHref, safeReturnPath, welcomeHref } from "../lib/account-rules";

type User = typeof authClient.$Infer.Session.user;
type AuthContext = {
  user: User | null;
  pending: boolean;
  canModerate: boolean;
  googleEnabled: boolean;
  requireAccount: () => boolean;
};
const subscribeHydration = () => () => {};
const clientHydrated = () => true;
const serverHydrated = () => false;
const Context = createContext<AuthContext | null>(null);
export function AuthProvider({
  initialUser,
  canModerate,
  googleEnabled,
  children,
}: {
  initialUser: User | null;
  canModerate: boolean;
  googleEnabled: boolean;
  children: ReactNode;
}) {
  const { data, isPending, error } = authClient.useSession();
  const hydrated = useSyncExternalStore(
    subscribeHydration,
    clientHydrated,
    serverHydrated,
  );
  const user = hydrated
    ? (data?.user ?? (isPending && !error ? initialUser : null))
    : initialUser;
  function requireAccount() {
    const next = safeReturnPath(
      window.location.pathname + window.location.search + window.location.hash,
    );
    if (!user) {
      navigateWithFreshSession(loginHref(next));
      return false;
    }
    if (!user.username) {
      navigateWithFreshSession(welcomeHref(next));
      return false;
    }
    return true;
  }
  return (
    <Context.Provider
      value={{
        user,
        pending: hydrated && isPending && !initialUser,
        canModerate: !!user && user.id === initialUser?.id && canModerate,
        googleEnabled,
        requireAccount,
      }}
    >
      {children}
    </Context.Provider>
  );
}
export function useAuth() {
  const value = useContext(Context);
  if (!value) throw new Error("useAuth requires AuthProvider");
  return value;
}
