"use client";
import { usePathname } from "next/navigation";
import Explorer, { routeParam } from "./explorer";

export default function ExplorerShell({ mobileHint }: { mobileHint: boolean }) {
  const pathname = usePathname();
  return (
    <Explorer
      initialProjectId={routeParam(pathname, "/prosjekt/")}
      initialProfile={routeParam(pathname, "/profil/")}
      mobileHint={mobileHint}
    />
  );
}
