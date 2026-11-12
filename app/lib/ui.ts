import { cn } from "./cn";

export const controlBase = [
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4",
  "text-sm font-semibold transition-[color,border-color,background-color,box-shadow,opacity,transform] duration-150",
  "disabled:pointer-events-none disabled:opacity-45",
  "active:translate-y-px motion-reduce:transition-none motion-reduce:active:translate-y-0",
].join(" ");

export const primaryButton = [
  controlBase,
  "border border-accent bg-accent text-white shadow-xs",
  "hover:border-accent-strong hover:bg-accent-strong",
].join(" ");

export const secondaryButton = [
  controlBase,
  "border border-border-strong bg-transparent text-ink",
  "hover:bg-surface-muted",
].join(" ");

/** The rounded comment and update composer; its border carries focus. */
export const composer = cn(
  "flex items-end gap-1.5 rounded-[20px] border border-border-strong bg-surface p-1",
  "transition-[border-color,box-shadow] duration-150 motion-reduce:transition-none",
  "focus-within:border-ink/35 focus-within:shadow-[0_1px_2px_rgb(20_28_24/0.06)]",
);

/** A borderless field inside the composer; 16px on mobile so iOS won't zoom. */
export const composerField = cn(
  "min-h-8 min-w-0 flex-1 py-1.25 pr-1 pl-3 text-sm leading-normal outline-none",
  "placeholder:text-muted max-md:text-base",
);

/** Round send button at the end of a comment or update composer. */
export const composerSend = cn(
  primaryButton,
  "size-8 min-h-0 shrink-0 rounded-full p-0 shadow-none",
  "disabled:border-transparent disabled:bg-ink/[0.08] disabled:text-muted disabled:opacity-100",
);

export const dangerButton = [
  controlBase,
  "border border-danger bg-danger text-white shadow-xs",
  "hover:border-danger-strong hover:bg-danger-strong",
].join(" ");

export const textButton = [
  controlBase,
  "min-h-10 rounded-lg border border-transparent px-2 text-accent",
  "hover:text-accent-strong hover:underline hover:underline-offset-4",
].join(" ");

export const accountAction = [
  controlBase,
  "min-h-14 w-full justify-start gap-3 border border-transparent px-3 text-left",
  "hover:bg-surface-muted [&>svg]:shrink-0 [&>svg]:text-muted",
].join(" ");

export const accountView =
  "motion-safe:animate-preview-in";

export const iconButton = [
  "inline-flex size-11 shrink-0 items-center justify-center rounded-xl border border-transparent text-muted",
  "transition-[color,background-color,opacity,transform] duration-150",
  "hover:bg-ink/[0.06] hover:text-ink",
  "aria-pressed:text-accent",
  "disabled:pointer-events-none disabled:opacity-45 active:scale-[0.97]",
  "motion-reduce:transition-none motion-reduce:active:scale-100",
].join(" ");

export const fieldControl = [
  "min-h-11 w-full rounded-xl border border-border-strong bg-surface px-3 text-base text-ink outline-none",
  "placeholder:text-muted/80",
  "focus:border-accent/55 focus:ring-3 focus:ring-accent/12",
  "disabled:cursor-not-allowed disabled:bg-surface-muted disabled:text-muted disabled:opacity-70",
].join(" ");

export const avatarTone = {
  sage: "bg-avatar-sage text-avatar-sage-ink",
  clay: "bg-avatar-clay text-avatar-clay-ink",
  blue: "bg-avatar-blue text-avatar-blue-ink",
} as const;

export const statusTone = {
  planned: {
    dot: "bg-status-planned",
    fill: "fill-status-planned",
    badge: "border-status-planned/25 text-status-planned-ink",
  },
  construction: {
    dot: "bg-status-construction",
    fill: "fill-status-construction",
    badge: "border-status-construction/30 text-status-construction-ink",
  },
  completed: {
    dot: "bg-status-completed",
    fill: "fill-status-completed",
    badge: "border-status-completed/25 text-status-completed-ink",
  },
} as const;
