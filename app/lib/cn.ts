import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

// Theme names from globals.css that tailwind-merge can't infer. Without them,
// `text-ui` reads as a colour and would knock out `text-muted`.
const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      text: ["2xs", "ui", "body"],
      shadow: [
        "control",
        "overlay",
        "popover",
        "float",
        "bar",
        "card",
        "panel",
        "dialog",
      ],
      radius: ["panel"],
      breakpoint: ["xs"],
      animate: [
        "preview-in",
        "menu-enter",
        "dialog-enter",
        "tooltip-in",
        "tooltip-in-below",
      ],
      ease: ["out-soft"],
    },
  },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
