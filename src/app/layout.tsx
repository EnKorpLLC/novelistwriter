import type { Metadata } from "next";
import { Fraunces, Source_Serif_4, DM_Sans } from "next/font/google";
import { LocalTimezoneCookie } from "@/components/LocalTimezoneCookie";
import "./globals.css";

const display = Fraunces({
  subsets: ["latin"],
  variable: "--font-fraunces",
  display: "swap",
});

const body = Source_Serif_4({
  subsets: ["latin"],
  variable: "--font-source",
  display: "swap",
});

const ui = DM_Sans({
  subsets: ["latin"],
  variable: "--font-dm",
  display: "swap",
});

const SITE_TITLE = "Novelist Writer — Write it yourself. Prove it.";
const SITE_DESCRIPTION =
  "The writing studio that takes your novel from first draft through beta readers and ARCs to launch. A record of how you wrote it, AI that critiques but never writes, and one switch to turn AI off.";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || "https://novelistwriter.com"),
  title: SITE_TITLE,
  description: SITE_DESCRIPTION,
  openGraph: {
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    siteName: "Novelist Writer",
    type: "website",
  },
  twitter: { card: "summary", title: SITE_TITLE, description: SITE_DESCRIPTION },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable} ${ui.variable}`}>
      <body
        className="antialiased"
        style={
          {
            "--font-display": "var(--font-fraunces)",
            "--font-body": "var(--font-source)",
            "--font-ui": "var(--font-dm)",
          } as React.CSSProperties
        }
      >
        <LocalTimezoneCookie />
        {children}
      </body>
    </html>
  );
}
