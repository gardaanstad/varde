import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { getPageSession, googleConfigured } from "./lib/auth";
import { isModerator } from "./lib/server/http";
import { AuthProvider } from "./components/auth-provider";
import TooltipLayer from "./components/tooltip-layer";

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

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const session = await getPageSession();
  return (
    <html
      lang="nb"
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
      </body>
    </html>
  );
}
