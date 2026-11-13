"use client";
import { navigateWithFreshSession } from "../lib/auth-navigation";
import { useEffect, useState } from "react";
import { Check, LoaderCircle } from "lucide-react";
import { usernameSchema } from "../lib/account-rules";
import { apiRequest, errorMessage } from "../lib/api-client";
import { authClient } from "../lib/auth-client";
import { cn } from "../lib/cn";
import { fieldControl, primaryButton } from "../lib/ui";
/** Where the explorer is now, panel, filters and map included. */
export function currentPath() {
  return window.location.pathname + window.location.search;
}

// Names already checked, so typing back to one answers at once.
const checked = new Map<string, boolean>();

/** Claims a username, then reloads the page where it is, signed in. */
export default function UsernameForm() {
  const [username, setUsername] = useState("");
  const [, setVersion] = useState(0);
  const [failed, setFailed] = useState<{ username: string; error: string }>();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const validation = usernameSchema.safeParse(username);
  const normalized = validation.success ? validation.data : "";
  useEffect(() => {
    if (!normalized || checked.has(normalized)) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      apiRequest<{ available: boolean }>(
        `/api/account/username?username=${encodeURIComponent(normalized)}`,
        { signal: controller.signal },
      )
        .then((result) => {
          checked.set(normalized, result.available);
          setVersion((version) => version + 1);
        })
        .catch((error) => {
          // Not kept: a failed check is tried again on the next change.
          if (!controller.signal.aborted)
            setFailed({ username: normalized, error: error.message });
        });
    }, 120);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [normalized]);
  const available = normalized ? checked.get(normalized) : undefined;
  const failure = failed?.username === normalized ? failed.error : "";
  const checking = !!normalized && available === undefined && !failure;
  const ready = available === true;
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (pending || !ready) return;
    setPending(true);
    setError("");
    try {
      await apiRequest("/api/account/username", {
        method: "POST",
        body: JSON.stringify({ username: normalized }),
      });
      await authClient.getSession({ query: { disableCookieCache: true } });
      navigateWithFreshSession(currentPath());
    } catch (error) {
      setError(errorMessage(error, "Prøv igjen."));
      setPending(false);
    }
  }
  const status =
    username && !validation.success ? (
      <span className="text-danger">{validation.error.issues[0].message}</span>
    ) : failure ? (
      <span className="text-danger">{failure}</span>
    ) : available === false ? (
      <span className="text-danger">Brukernavnet er allerede tatt.</span>
    ) : ready ? (
      <span className="flex items-center gap-1 text-accent">
        <Check size={13} aria-hidden="true" />Ledig
      </span>
    ) : null;
  return (
    <form onSubmit={submit} className="mt-3">
      <div className="relative">
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-muted"
        >
          @
        </span>
        <input
          id="username"
          name="username"
          aria-label="Brukernavn"
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          autoFocus
          minLength={3}
          maxLength={24}
          required
          value={username}
          onChange={(event) => {
            setUsername(event.target.value);
            setFailed(undefined);
            setError("");
          }}
          aria-describedby="username-status username-help"
          aria-invalid={
            !!username && (!validation.success || available === false)
          }
          className={cn(fieldControl, "pl-7.5")}
          placeholder="ditt_brukernavn"
        />
      </div>
      <p
        id="username-status"
        aria-live="polite"
        className="mt-1.5 min-h-4.5 text-xs leading-4.5"
      >
        {status}
      </p>
      <p id="username-help" className="text-xs leading-4.5 text-muted">
        3–24 tegn: bokstaver, tall og understrek. Kan ikke endres.
      </p>
      {error && (
        <p role="alert" className="mt-2 text-sm text-danger">
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={pending || !ready}
        aria-busy={checking || pending}
        className={cn(primaryButton, "mt-4 w-full")}
      >
        {(checking || pending) && (
          <LoaderCircle
            size={16}
            aria-hidden="true"
            className="animate-spin motion-reduce:animate-none"
          />
        )}
        Fortsett
      </button>
    </form>
  );
}
