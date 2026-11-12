/**
 * Light or dark. The system decides until someone picks the other one; that
 * choice is kept in a cookie, so the server renders `data-theme` on <html>
 * and the page never paints in the wrong colours. Picking what the system
 * already shows clears it, so the page follows the system again.
 */
export type Theme = "light" | "dark";

export const themeCookie = "varde-theme";

export function parseTheme(value: string | undefined): Theme | undefined {
  return value === "light" || value === "dark" ? value : undefined;
}

// The browser's own chrome matches the canvas (--color-canvas).
export const themeColors: Record<Theme, string> = {
  light: "#f3f4f2",
  dark: "#000000",
};
