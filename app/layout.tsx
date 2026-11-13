import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { cookies } from "next/headers";
import "./globals.css";
import { parseTheme, themeCookie, themeColors } from "./lib/theme";
import { getPageSession, googleConfigured } from "./lib/auth";
import { isModerator } from "./lib/server/http";
import { AuthProvider } from "./components/auth-provider";
import TooltipLayer from "./components/tooltip-layer";
import { Toaster } from "./components/toast";
import PressLayer from "./components/press-layer";
import { ThemeColorSync } from "./components/theme-toggle";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Varde",
  description:
    "Samferdsel, energi, vann, offentlige bygg og byutvikling i Norge. Følg prosjektene, se oppdateringer og diskuter.",
};

async function chosenTheme() {
  return parseTheme((await cookies()).get(themeCookie)?.value);
}

// The browser's own chrome matches the canvas. Kept static (reading the
// cookie here broke in-place flows such as choosing a username in the
// account panel); ThemeColorSync applies a chosen theme on the client.
export const viewport: Viewport = {
  colorScheme: "light dark",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: themeColors.light },
    { media: "(prefers-color-scheme: dark)", color: themeColors.dark },
  ],
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const [session, theme] = await Promise.all([getPageSession(), chosenTheme()]);
  return (
    <html
      lang="nb"
      data-theme={theme}
      className={`${geistSans.variable} ${geistMono.variable} h-full bg-canvas font-sans text-ink antialiased`}
      // The script below sets a variable on it before hydration.
      suppressHydrationWarning
    >
      <head>
        {/*
          How wide a thin scrollbar is here (0 where they overlay), for
          `px-gutter-scroll`: the same box as a `scrollbar-thin` scroller's,
          off-screen rather than hidden, since hidden boxes get no scrollbar.
        */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(()=>{const d=document.createElement("div");d.style.cssText="position:absolute;top:-200px;width:100px;height:100px;overflow-y:scroll;scrollbar-width:thin;scrollbar-gutter:stable";document.documentElement.append(d);document.documentElement.style.setProperty("--scrollbar-thin",d.offsetWidth-d.clientWidth+"px");d.remove()})()`,
          }}
        />
      </head>
      <body className="flex min-h-full flex-col bg-canvas text-ink">
        <AuthProvider
          initialUser={session?.user ?? null}
          canModerate={!!session && isModerator(session.user)}
          googleEnabled={googleConfigured()}
        >
          {children}
        </AuthProvider>
        <TooltipLayer />
        <Toaster />
        <PressLayer />
        <ThemeColorSync />
      </body>
    </html>
  );
}
