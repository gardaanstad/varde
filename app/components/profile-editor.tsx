"use client";

import { useId, useRef, useState } from "react";
import { Check, LoaderCircle } from "lucide-react";
import { authClient } from "../lib/auth-client";
import { apiRequest, errorMessage } from "../lib/api-client";
import type { Profile } from "../lib/profiles";
import { cn } from "../lib/cn";
import { fieldControl, primaryButton } from "../lib/ui";

export default function ProfileEditor({
  user,
}: {
  user: typeof authClient.$Infer.Session.user;
}) {
  const { refetch } = authClient.useSession();
  const id = useId();
  const [bio, setBio] = useState(user.bio || "");
  const [location, setLocation] = useState(user.location || "");
  const [saved, setSaved] = useState({
    bio: user.bio || "",
    location: user.location || "",
  });
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [feedback, setFeedback] = useState<{
    text: string;
    error?: boolean;
  } | null>(null);
  const dirty = bio.trim() !== saved.bio || location.trim() !== saved.location;

  async function save(task: () => Promise<string>) {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setFeedback(null);
    try {
      setFeedback({ text: await task() });
    } catch (error) {
      setFeedback({
        text: errorMessage(error, "Kunne ikke lagre profilen. Prøv igjen."),
        error: true,
      });
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  return (
    <div>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (!dirty) return;
          void save(async () => {
            const { profile } = await apiRequest<{ profile: Profile }>(
              "/api/account/profile",
              { method: "PATCH", body: JSON.stringify({ bio, location }) },
            );
            setBio(profile.bio);
            setLocation(profile.location);
            setSaved({ bio: profile.bio, location: profile.location });
            await refetch({ query: { disableCookieCache: true } });
            return "Profilen er oppdatert.";
          });
        }}
      >
        <fieldset disabled={!!busy} className="space-y-4">
          <div>
            <label htmlFor={`${id}-bio`} className="text-sm font-semibold">
              Om deg
            </label>
            <textarea
              data-base-ui-swipe-ignore
              id={`${id}-bio`}
              value={bio}
              onChange={(event) => {
                setBio(event.target.value);
                setFeedback(null);
              }}
              maxLength={280}
              rows={3}
              aria-describedby={`${id}-bio-help`}
              className={cn(
                fieldControl,
                "mt-2 block resize-none py-2.5 leading-6",
              )}
              placeholder="Hva engasjerer deg i nabolaget?"
            />
            <p
              id={`${id}-bio-help`}
              className="mt-1.5 text-right text-xs tabular-nums text-muted"
            >
              {bio.length}/280
            </p>
          </div>
          <div>
            <label htmlFor={`${id}-location`} className="text-sm font-semibold">
              Sted
            </label>
            <input
              data-base-ui-swipe-ignore
              id={`${id}-location`}
              value={location}
              onChange={(event) => {
                setLocation(event.target.value);
                setFeedback(null);
              }}
              maxLength={80}
              className={cn(fieldControl, "mt-2")}
              placeholder="For eksempel Tøyen, Oslo"
            />
          </div>
          <button
            type="submit"
            disabled={!!busy || !dirty}
            className={cn(primaryButton, "w-full")}
          >
            {busy && (
              <LoaderCircle
                size={16}
                className="animate-spin motion-reduce:animate-none"
                aria-hidden="true"
              />
            )}
            {busy ? "Lagrer …" : "Lagre profil"}
          </button>
        </fieldset>
        <div
          className="mt-2 min-h-6 text-xs leading-6"
          aria-live="polite"
          aria-atomic="true"
        >
          {feedback && (
            <p
              role={feedback.error ? "alert" : "status"}
              className={cn(
                "flex items-start gap-2",
                feedback.error ? "text-danger" : "text-accent",
              )}
            >
              {!feedback.error && (
                <Check size={15} className="mt-1 shrink-0" aria-hidden="true" />
              )}
              {feedback.text}
            </p>
          )}
        </div>
      </form>
    </div>
  );
}
