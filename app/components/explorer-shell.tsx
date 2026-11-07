"use client";
import { usePathname, useSearchParams } from "next/navigation";
import Explorer, { routeParam } from "./explorer";

export default function ExplorerShell({ mobileHint }: { mobileHint: boolean }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  return (
    <Explorer
      initialProjectId={routeParam(pathname, "/prosjekt/")}
      initialProfile={routeParam(pathname, "/profil/")}
      initialSearch={searchParams.toString()}
      mobileHint={mobileHint}
    />
  );
}
