import type { Category } from "../lib/data";
import { cn } from "../lib/cn";
import CategoryIcon from "./category-icon";

/** Stands in for a project photo: a faint grid with the category icon. */
export default function ProjectPlaceholder({
  category,
  className,
  iconSize = 22,
}: {
  category: Category;
  className?: string;
  iconSize?: number;
}) {
  return (
    <div
      className={cn(
        "absolute inset-0 grid place-items-center bg-surface-muted",
        "bg-[linear-gradient(var(--color-border)_1px,transparent_1px),linear-gradient(90deg,var(--color-border)_1px,transparent_1px)] bg-size-[24px_24px] bg-center",
        className,
      )}
      aria-hidden="true"
    >
      <span className="grid aspect-square w-[29%] max-w-26 min-w-9 place-items-center rounded-full bg-surface text-accent shadow-xs">
        <CategoryIcon category={category} size={iconSize} strokeWidth={1.75} />
      </span>
    </div>
  );
}
