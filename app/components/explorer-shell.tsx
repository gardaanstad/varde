"use client";
import { useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import Explorer, { routeParam } from "./explorer";

export default function ExplorerShell({ mobileHint }: { mobileHint: boolean }) {
  const pathname = usePathname();
  // Read once: the explorer writes the query string itself as the map moves,
  // and passing each new one down would re-render it after every move.
  const searchParams = useSearchParams();
  const [initialSearch] = useState(() => searchParams.toString());
  return (
    <Explorer
      initialProjectId={routeParam(pathname, "/prosjekt/")}
      initialProfile={routeParam(pathname, "/profil/")}
      initialSearch={initialSearch}
      mobileHint={mobileHint}
    />
  );
}
