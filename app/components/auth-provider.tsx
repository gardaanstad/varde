"use client";
import {
  createContext,
  useCallback,
  useContext,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { authClient } from "../lib/auth-client";
import { storeLoginIntent, type LoginIntent } from "../lib/login-intent";
import LoginPrompt from "./login-prompt";

type User = typeof authClient.$Infer.Session.user;
type AuthContext = {
  user: User | null;
  pending: boolean;
  canModerate: boolean;
  googleEnabled: boolean;
  /**
   * True for a member with a username. A guest is asked to log in, told
   * why by `reason`; `intent` is picked up again after they return.
   */
  requireLogin: (reason?: string, intent?: LoginIntent) => boolean;
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
  const [prompt, setPrompt] = useState<{ reason?: string } | null>(null);
  const closePrompt = useCallback(() => setPrompt(null), []);
  function requireLogin(reason?: string, intent?: LoginIntent) {
    if (!user) {
      storeLoginIntent(intent);
      setPrompt({ reason });
      return false;
    }
    // UsernamePrompt is over the page until a username is chosen.
    if (!user.username) {
      storeLoginIntent(intent);
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
        requireLogin,
      }}
    >
      {children}
      {prompt && <LoginPrompt reason={prompt.reason} onClose={closePrompt} />}
    </Context.Provider>
  );
}
export function useAuth() {
  const value = useContext(Context);
  if (!value) throw new Error("useAuth requires AuthProvider");
  return value;
}
