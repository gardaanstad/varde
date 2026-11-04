import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { cn } from "../lib/cn";
import { textButton } from "../lib/ui";

export default function BackLink({ href = "/" }: { href?: string }) {
  return (
    <Link href={href} className={cn(textButton, "min-h-11 w-fit text-muted")}>
      <ArrowLeft size={17} aria-hidden="true" />
      Tilbake
    </Link>
  );
}
