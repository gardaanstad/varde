import Link from "next/link";
import type { ReactNode } from "react";

import { cn } from "../lib/cn";
import BackLink from "./back-link";
export default function AuthShell({
  children,
  back = "/",
}: {
  children: ReactNode;
  back?: string;
}) {
  return (
    <main className="flex min-h-dvh flex-col bg-canvas px-5 py-5 sm:px-10 sm:py-8">
      <BackLink href={back} />
      <div className="m-auto w-full max-w-110 py-8">
        <Link
          href="/"
          className={cn(
            "mx-auto mb-6 flex min-h-11 w-fit items-center gap-2.5 rounded-lg text-xl font-bold tracking-tight text-ink transition-colors hover:text-accent motion-reduce:transition-none",
          )}
        >
          <span
            aria-hidden="true"
            className="flex h-6 items-end gap-0.75 -skew-y-8 text-accent"
          >
            <i className="h-4 w-1.5 rounded-xs bg-current" />
            <i className="h-6 w-1.5 rounded-xs bg-current" />
            <i className="h-5 w-1.5 rounded-xs bg-current" />
          </span>
          Varde
        </Link>
        <div className="rounded-panel border border-border bg-surface p-6 shadow-card sm:p-8">
          {children}
        </div>
      </div>
    </main>
  );
}
