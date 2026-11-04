import { cn } from "../lib/cn";
import { avatarTone } from "../lib/ui";

export default function ProfileAvatar({
  name,
  tone = "sage",
  className,
}: {
  name: string;
  tone?: keyof typeof avatarTone;
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-grid size-12 shrink-0 place-items-center rounded-full text-lg font-semibold",
        avatarTone[tone],
        className,
      )}
    >
      {name.slice(0, 1).toUpperCase()}
    </span>
  );
}
