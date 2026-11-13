import type { ReactNode } from "react";

/** A centred icon and heading where a list has nothing to show. */
export default function EmptyState({
  icon,
  title,
  level = 3,
  children,
}: {
  icon: ReactNode;
  title: string;
  level?: 2 | 3;
  children?: ReactNode;
}) {
  const Heading = level === 2 ? "h2" : "h3";
  return (
    <div className="flex flex-col items-center gap-2.5 px-4 py-10 text-center text-muted">
      {icon}
      <Heading className="text-body font-medium text-ink">{title}</Heading>
      {children}
    </div>
  );
}
