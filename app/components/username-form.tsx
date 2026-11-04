"use client";
import { navigateWithFreshSession } from "../lib/auth-navigation";
import { useEffect, useState } from "react";
import { ArrowRight, Check, LoaderCircle } from "lucide-react";
import { usernameSchema } from "../lib/account-rules";
import { apiRequest, errorMessage } from "../lib/api-client";
import { authClient } from "../lib/auth-client";
import { cn } from "../lib/cn";
import { fieldControl, primaryButton } from "../lib/ui";
export default function UsernameForm({ next }: { next: string }) {
  const [username, setUsername] = useState("");
  const [check, setCheck] = useState<{
    username: string;
    available?: boolean;
    error?: string;
  } | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const validation = usernameSchema.safeParse(username);
  const normalized = validation.success ? validation.data : "";
  useEffect(() => {
    if (!normalized) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      apiRequest<{ available: boolean }>(
        `/api/account/username?username=${encodeURIComponent(normalized)}`,
        { signal: controller.signal },
      )
        .then((result) =>
          setCheck({ username: normalized, available: result.available }),
        )
        .catch((error) => {
          if (!controller.signal.aborted)
            setCheck({ username: normalized, error: error.message });
        });
    }, 350);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [normalized]);
  const result = check?.username === normalized ? check : null;
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (pending || !validation.success) return;
    setPending(true);
    setError("");
    try {
      await apiRequest("/api/account/username", {
        method: "POST",
        body: JSON.stringify({ username: normalized }),
      });
      await authClient.getSession({ query: { disableCookieCache: true } });
      navigateWithFreshSession(next);
    } catch (error) {
      setError(errorMessage(error, "Prøv igjen."));
      setPending(false);
    }
  }
  return (
    <form onSubmit={submit} className="mt-7">
      <label htmlFor="username" className="text-sm font-semibold text-ink">
        Brukernavn
      </label>
      <div className="relative mt-2">
        <span
          aria-hidden="true"
          className="pointer-events-none absolute top-3.5 left-4 text-muted"
        >
          @
        </span>
        <input
          id="username"
          name="username"
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
            setError("");
          }}
          aria-describedby="username-help username-status"
          aria-invalid={
            !!username && (!validation.success || result?.available === false)
          }
          className={cn(
            fieldControl,
            "min-h-13 rounded-xl py-3 pr-4 pl-9 text-base",
          )}
          placeholder="ditt_brukernavn"
        />
      </div>
      <p id="username-help" className="mt-2 text-xs leading-5 text-muted">
        3–24 tegn. Bokstaver, tall og understrek. Du kan bruke æ, ø og å.
        Brukernavnet er permanent.
      </p>
      <div
        id="username-status"
        aria-live="polite"
        className="mt-2 min-h-7 text-xs"
      >
        {username && !validation.success ? (
          <span className="text-danger">
            {validation.error.issues[0].message}
          </span>
        ) : normalized ? (
          result?.error ? (
            <span className="text-danger">{result.error}</span>
          ) : result?.available === false ? (
            <span className="text-danger">
              Brukernavnet er opptatt. Prøv et annet.
            </span>
          ) : result?.available ? (
            <span className="flex items-center gap-1.5 text-accent">
              <Check size={14} />@{normalized} er ledig
            </span>
          ) : (
            <span className="text-muted">Sjekker brukernavnet …</span>
          )
        ) : null}
      </div>
      {error && (
        <p role="alert" className="mb-3 text-sm text-danger">
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={pending || !validation.success || result?.available === false}
        className={cn(primaryButton, "mt-3 min-h-13 w-full rounded-xl text-sm")}
      >
        {pending ? (
          <>
            <LoaderCircle
              size={17}
              className="animate-spin motion-reduce:animate-none"
            />
            Gjør klart …
          </>
        ) : (
          <>
            Fortsett
            <ArrowRight size={17} />
          </>
        )}
      </button>
    </form>
  );
}
