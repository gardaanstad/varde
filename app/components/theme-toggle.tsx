"use client";
import { useEffect, useSyncExternalStore } from "react";
import { flushSync } from "react-dom";
import { Moon, Sun } from "lucide-react";
import { cn } from "../lib/cn";
import { iconButton } from "../lib/ui";
import { parseTheme, themeColors, themeCookie, type Theme } from "../lib/theme";

const darkQuery = "(prefers-color-scheme: dark)";

const systemTheme = (): Theme =>
  window.matchMedia(darkQuery).matches ? "dark" : "light";

function currentTheme(): Theme {
  return parseTheme(document.documentElement.dataset.theme) ?? systemTheme();
}

const listeners = new Set<() => void>();

function subscribeTheme(onChange: () => void) {
  const query = window.matchMedia(darkQuery);
  listeners.add(onChange);
  query.addEventListener("change", onChange);
  return () => {
    listeners.delete(onChange);
    query.removeEventListener("change", onChange);
  };
}

/** Next renders one theme-color per scheme; a choice overrides both. */
function syncThemeColor(chosen: Theme | undefined) {
  for (const meta of document.querySelectorAll<HTMLMetaElement>(
    'meta[name="theme-color"]',
  )) {
    const scheme = meta.media.includes("dark") ? "dark" : "light";
    meta.content = themeColors[chosen ?? scheme];
  }
}

function setTheme(theme: Theme) {
  const root = document.documentElement;
  const chosen = theme === systemTheme() ? undefined : theme;
  const apply = () => {
    if (chosen) root.dataset.theme = chosen;
    else delete root.dataset.theme;
    document.cookie = chosen
      ? `${themeCookie}=${chosen}; path=/; max-age=31536000; samesite=lax`
      : `${themeCookie}=; path=/; max-age=0; samesite=lax`;
    syncThemeColor(chosen);
    // Rendered now, so the transition's new view already has it.
    flushSync(() => listeners.forEach((listener) => listener()));
  };
  // The page cross-fades from one palette to the other.
  if (
    !document.startViewTransition ||
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  ) {
    apply();
    return;
  }
  root.dataset.themeTransition = "";
  document
    .startViewTransition(apply)
    .finished.finally(() => delete root.dataset.themeTransition);
}

/** Brings theme-color in line with a theme chosen on an earlier visit. */
export function ThemeColorSync() {
  useEffect(() => {
    syncThemeColor(parseTheme(document.documentElement.dataset.theme));
  }, []);
  return null;
}

/** The page's theme; light on the server, where the system is unknown. */
export function useTheme() {
  return useSyncExternalStore<Theme>(subscribeTheme, currentTheme, () => "light");
}

const icon =
  "absolute transition-[rotate,scale,opacity] duration-300 ease-out-soft motion-reduce:transition-none";

/**
 * Sun in light mode, moon in dark. The icons follow the CSS theme, so they
 * are right before hydration; only the switch state waits for it.
 */
export default function ThemeToggle({ tooltip = true }: { tooltip?: boolean }) {
  const dark = useTheme() === "dark";
  return (
    <button
      type="button"
      role="switch"
      aria-checked={dark}
      aria-label="Mørk modus"
      data-tooltip={tooltip ? "Mørk modus" : undefined}
      className={cn(iconButton, "relative rounded-lg hover:text-ink")}
      onClick={() => setTheme(currentTheme() === "dark" ? "light" : "dark")}
    >
      <Sun
        size={19}
        aria-hidden="true"
        className={cn(icon, "dark:scale-50 dark:-rotate-90 dark:opacity-0")}
      />
      <Moon
        size={18}
        aria-hidden="true"
        className={cn(
          icon,
          "scale-50 rotate-90 opacity-0 dark:scale-100 dark:rotate-0 dark:opacity-100",
        )}
      />
    </button>
  );
}
