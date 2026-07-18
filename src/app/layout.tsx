import type { Metadata } from "next";
import { Fraunces, Source_Serif_4, DM_Sans } from "next/font/google";
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

export const metadata: Metadata = {
  title: "Novelist Writer — Write the book. AI stress-tests the craft.",
  description:
    "The writing studio for indie novelists. AI critiques coherence, voice, and arcs — without writing a word of your novel. Export KDP-ready.",
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
        {children}
      </body>
    </html>
  );
}
