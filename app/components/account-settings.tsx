"use client";

import Link from "next/link";
import { useId, useRef, useState } from "react";
import { Check, LogOut, Monitor, ShieldCheck, Trash2 } from "lucide-react";
import { navigateWithFreshSession } from "../lib/auth-navigation";
import { authClient } from "../lib/auth-client";
import { errorMessage } from "../lib/api-client";
import {
  accountAction,
  accountView,
  dangerButton,
  fieldControl,
  secondaryButton,
  textButton,
} from "../lib/ui";
import { cn } from "../lib/cn";
import ProfileAvatar from "./profile-avatar";

type Feedback = { action: string; text: string; error?: boolean } | null;

export default function AccountSettings({
  user,
  embedded = false,
}: {
  user: typeof authClient.$Infer.Session.user;
  embedded?: boolean;
}) {
  const id = useId();
  const [busy, setBusy] = useState<string | null>(null);
  const busyRef = useRef(false);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [deleting, setDeleting] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const [reauth, setReauth] = useState(false);
  const deleteTrigger = useRef<HTMLButtonElement>(null);

  async function perform(action: string, task: () => Promise<string | void>) {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(action);
    setFeedback(null);
    try {
      const text = await task();
      if (text) setFeedback({ action, text });
    } catch (error) {
      setFeedback({
        action,
        text: errorMessage(error, "Noe gikk galt. Prøv igjen."),
        error: true,
      });
    } finally {
      busyRef.current = false;
      setBusy(null);
    }
  }

  function notice(action: string) {
    const current = feedback?.action === action ? feedback : null;
    return (
      <div
        className="text-xs leading-6 not-empty:mt-2"
        aria-live="polite"
        aria-atomic="true"
      >
        {current && (
          <p
            role={current.error ? "alert" : "status"}
            className={cn(
              "flex items-start gap-2",
              current.error ? "text-danger" : "text-accent",
            )}
          >
            {!current.error && (
              <Check size={15} className="mt-1 shrink-0" aria-hidden="true" />
            )}
            {current.text}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className={cn("flex min-h-0 flex-col", embedded && "h-full")}>
      {!embedded && (
        <header className="mb-6">
          <h1 className="text-2xl font-semibold tracking-tight">
            Kontoinnstillinger
          </h1>
          <div className="mt-5 flex items-center gap-3">
            <ProfileAvatar name={user.username!} />
            <div className="min-w-0">
              <p className="text-sm font-semibold wrap-anywhere">
                @{user.username}
              </p>
            </div>
          </div>
        </header>
      )}
      <div
        data-drawer-scroll
        className={cn(
          "min-h-0",
          embedded &&
            "flex-1 overflow-y-auto overscroll-contain px-6 py-6 scrollbar-thin",
        )}
      >
        <div className="flex items-center gap-3 rounded-xl border border-border bg-surface-subtle px-4 py-3">
          <ShieldCheck
            size={18}
            className="shrink-0 text-accent"
            aria-hidden="true"
          />
          <div className="min-w-0">
            <p className="text-xs text-muted">Koblet til Google</p>
            <p className="text-sm wrap-anywhere">{user.email}</p>
          </div>
        </div>
        <div className="mt-2">
          <button
            type="button"
            disabled={!!busy}
            className={cn(accountAction, "min-h-12")}
            onClick={() =>
              void perform("logout", async () => {
                const result = await authClient.signOut();
                if (result.error)
                  throw new Error("Kunne ikke logge ut. Prøv igjen.");
                navigateWithFreshSession("/");
              })
            }
          >
            <LogOut size={18} aria-hidden="true" />
            {busy === "logout" ? "Logger ut …" : "Logg ut"}
          </button>
          <button
            type="button"
            disabled={!!busy}
            className={cn(accountAction, "min-h-12")}
            onClick={() =>
              void perform("sessions", async () => {
                const result = await authClient.revokeOtherSessions();
                if (result.error)
                  throw new Error(
                    "Kunne ikke logge ut andre enheter. Prøv igjen.",
                  );
                return "Du er logget ut på alle andre enheter.";
              })
            }
          >
            <Monitor size={18} aria-hidden="true" />
            {busy === "sessions"
              ? "Logger ut enheter …"
              : "Logg ut andre enheter"}
          </button>
          {notice(feedback?.action === "logout" ? "logout" : "sessions")}
        </div>
        <div className="mt-2 border-t border-border pt-2">
          <button
            ref={deleteTrigger}
            type="button"
            disabled={!!busy}
            className={cn(
              accountAction,
              "min-h-12 text-danger hover:bg-danger-soft hover:text-danger-strong [&>svg]:text-danger",
              deleting && "hidden",
            )}
            onClick={() => {
              setDeleting(true);
              setFeedback(null);
            }}
          >
            <Trash2 size={18} aria-hidden="true" />
            Slett kontoen min
          </button>
          {deleting && (
            <div
              className={cn(
                "rounded-xl border border-danger/20 bg-danger-soft p-4",
                accountView,
              )}
            >
              <p className="text-xs leading-6">
                Kontoen, profilen, kommentarene, stemmene og fulgte prosjekter
                slettes permanent. Svar fra andre beholdes.
              </p>
              <label
                htmlFor={`${id}-confirmation`}
                className="mt-3 block text-xs leading-6"
              >
                Skriv <strong className="wrap-anywhere">{user.username}</strong>{" "}
                for å bekrefte.
              </label>
              <input
                id={`${id}-confirmation`}
                aria-label="Bekreft brukernavn for sletting"
                autoComplete="off"
                autoCapitalize="none"
                spellCheck={false}
                autoFocus
                disabled={!!busy}
                value={confirmation}
                onChange={(event) => setConfirmation(event.target.value)}
                className={cn(fieldControl, "mt-2")}
              />
              {notice("delete")}
              {reauth && (
                <Link
                  href="/logg-inn?next=%2Fkonto&reauth=1"
                  className={cn(secondaryButton, "mb-3 w-full")}
                >
                  Bekreft med Google
                </Link>
              )}
              <div className="mt-3 flex flex-col gap-2">
                <button
                  type="button"
                  disabled={!!busy || confirmation !== user.username}
                  className={dangerButton}
                  onClick={() =>
                    void perform("delete", async () => {
                      const result = await authClient.deleteUser();
                      if (result.error) {
                        if (result.error.code === "SESSION_EXPIRED") {
                          setReauth(true);
                          throw new Error(
                            "Bekreft Google-kontoen på nytt før du sletter kontoen.",
                          );
                        }
                        throw new Error(
                          "Kunne ikke slette kontoen. Prøv igjen.",
                        );
                      }
                      navigateWithFreshSession("/");
                    })
                  }
                >
                  {busy === "delete" ? "Sletter …" : "Slett konto permanent"}
                </button>
                <button
                  type="button"
                  className={textButton}
                  disabled={!!busy}
                  onClick={() => {
                    setDeleting(false);
                    setConfirmation("");
                    setReauth(false);
                    setFeedback(null);
                    requestAnimationFrame(() =>
                      deleteTrigger.current?.focus({ preventScroll: true }),
                    );
                  }}
                >
                  Avbryt
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
