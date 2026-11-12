"use client";
import { useEffect, useId, useState } from "react";
import Image from "next/image";
import { ImagePlus, LoaderCircle, X } from "lucide-react";
import { errorMessage } from "../lib/api-client";
import { cn } from "../lib/cn";
import { uploadImage } from "../lib/upload-image";

const tile = "relative aspect-4/3 overflow-hidden rounded-lg";

/**
 * Picks images from the device and uploads them straight away; `value` holds
 * the uploaded URLs in order. Reports in-flight uploads through `onBusy`.
 */
export default function ImagePicker({
  value,
  onChange,
  onBusy,
  max = 10,
  id,
  className,
}: {
  id?: string;
  value: string[];
  onChange: (update: (current: string[]) => string[]) => void;
  onBusy?: (busy: boolean) => void;
  max?: number;
  className?: string;
}) {
  const inputId = useId();
  const [pending, setPending] = useState(0);
  const [error, setError] = useState("");
  const room = max - value.length - pending;
  const busy = pending > 0;
  useEffect(() => onBusy?.(busy), [busy, onBusy]);

  async function add(files: File[]) {
    const picked = files.slice(0, Math.max(0, room));
    if (!picked.length) return;
    setError("");
    setPending((count) => count + picked.length);
    await Promise.all(
      picked.map(async (file) => {
        try {
          const src = await uploadImage(file);
          onChange((current) => [...current, src]);
        } catch (failure) {
          setError(errorMessage(failure, "Kunne ikke laste opp bildet."));
        } finally {
          setPending((count) => count - 1);
        }
      }),
    );
  }

  return (
    <div id={id} className={className}>
      <ul className="grid list-none grid-cols-3 gap-2 p-0 max-xs:grid-cols-2">
        {value.map((src, index) => (
          <li key={src} className={cn(tile, "bg-surface-muted")}>
            <Image
              src={src}
              alt={`Bilde ${index + 1}`}
              fill
              sizes="180px"
              // Members' photos are private until approved; the optimizer
              // fetches without the viewer's session.
              unoptimized
              className="object-cover"
            />
            <button
              type="button"
              className="absolute top-1.5 right-1.5 grid size-7 place-items-center rounded-full bg-scrim/60 text-white transition-colors hover:bg-scrim/80"
              aria-label={`Fjern bilde ${index + 1}`}
              onClick={() =>
                onChange((current) => current.filter((item) => item !== src))
              }
            >
              <X size={14} />
            </button>
          </li>
        ))}
        {Array.from({ length: pending }, (_, index) => (
          <li
            key={`pending-${index}`}
            className={cn(tile, "grid place-items-center bg-surface-muted text-muted")}
          >
            <LoaderCircle size={18} className="animate-spin" aria-hidden="true" />
            <span className="sr-only">Laster opp …</span>
          </li>
        ))}
        {room > 0 && (
          <li className={tile}>
            <label
              htmlFor={inputId}
              className={cn(
                "flex size-full cursor-pointer flex-col items-center justify-center gap-1 rounded-lg",
                "border border-dashed border-border-strong text-xs font-medium text-muted",
                "transition-colors duration-120 hover:border-accent/50 hover:text-accent",
                "focus-within:border-accent focus-within:text-accent",
              )}
            >
              <ImagePlus size={18} aria-hidden="true" />
              Legg til bilde
              <input
                id={inputId}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                multiple
                className="sr-only"
                onChange={(event) => {
                  void add(Array.from(event.target.files ?? []));
                  event.target.value = "";
                }}
              />
            </label>
          </li>
        )}
      </ul>
      {error && (
        <p role="alert" className="mt-2 text-xs text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
