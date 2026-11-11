"use client";
import { useEffect, useState } from "react";
import { LoaderCircle } from "lucide-react";
import { authClient } from "../lib/auth-client";
import { safeReturnPath, welcomeHref } from "../lib/account-rules";
import { cn } from "../lib/cn";

import { useAuth } from "./auth-provider";

function GoogleMark() {
  return (
    <svg aria-hidden="true" viewBox="0 0 48 48" className="size-5 shrink-0">
      <path
        fill="#4285F4"
        d="M43.6 24.5c0-1.4-.1-2.7-.4-4H24v7.6h11a9.5 9.5 0 0 1-4.1 6.2v5h6.6c3.9-3.6 6.1-8.8 6.1-14.8Z"
      />
      <path
        fill="#34A853"
        d="M24 44c5.5 0 10.1-1.8 13.5-4.9l-6.6-5c-1.8 1.2-4.1 2-6.9 2-5.3 0-9.8-3.6-11.4-8.4H5.8v5.2A20.4 20.4 0 0 0 24 44Z"
      />
      <path
        fill="#FBBC05"
        d="M12.6 27.7a12.3 12.3 0 0 1 0-7.4v-5.2H5.8a20 20 0 0 0 0 17.8l6.8-5.2Z"
      />
      <path
        fill="#EA4335"
        d="M24 11.9c3 0 5.7 1 7.8 3l5.8-5.8A19.6 19.6 0 0 0 24 4 20.4 20.4 0 0 0 5.8 15.1l6.8 5.2C14.2 15.5 18.7 11.9 24 11.9Z"
      />
    </svg>
  );
}
export default function GoogleSignIn({
  next = "/",
  reauthenticate = false,
  label = "Fortsett med Google",
}: {
  next?: string;
  reauthenticate?: boolean;
  label?: string;
}) {
  const { googleEnabled } = useAuth();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    // A browser-back return from Google can restore this page from the back/forward cache.
    const resume = () => setPending(false);
    window.addEventListener("pageshow", resume);
    return () => window.removeEventListener("pageshow", resume);
  }, []);
  async function signIn() {
    if (pending) return;
    setPending(true);
    setError("");
    const destination = safeReturnPath(next);
    const callbackURL = welcomeHref(destination);
    try {
      const result = await authClient.signIn.social({
        provider: "google",
        callbackURL,
        newUserCallbackURL: callbackURL,
        errorCallbackURL: `/logg-inn?next=${encodeURIComponent(destination)}&error=google`,
        ...(reauthenticate ? { prompt: "select_account" as const } : {}),
      });
      if (result.error) {
        setError("Innloggingen kunne ikke starte. Prøv igjen om litt.");
        setPending(false);
      }
    } catch {
      setError("Kunne ikke kontakte Google. Sjekk forbindelsen og prøv igjen.");
      setPending(false);
    }
  }
  return (
    <div className="w-full">
      <button
        type="button"
        disabled={pending || !googleEnabled}
        onClick={() => void signIn()}
        className={cn(
          "flex min-h-13 w-full items-center justify-center gap-3 rounded-xl border border-border-strong bg-surface px-5 text-sm font-semibold text-ink transition-colors duration-150 motion-reduce:transition-none hover:border-accent/50 hover:bg-surface-subtle disabled:cursor-not-allowed disabled:opacity-60",
        )}
      >
        {pending ? (
          <LoaderCircle className="size-5 animate-spin motion-reduce:animate-none" />
        ) : (
          <GoogleMark />
        )}
        {pending ? "Åpner Google …" : label}
      </button>
      {!googleEnabled && (
        <p
          role="status"
          className="mt-3 text-center text-xs leading-6 text-muted"
        >
          Google-innlogging blir tilgjengelig snart. Du kan fortsatt utforske
          alle prosjektene.
        </p>
      )}
      {error && (
        <p role="alert" className="mt-3 text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
