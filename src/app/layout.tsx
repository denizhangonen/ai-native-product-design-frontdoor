import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// The canonical public address, so shared links resolve their preview image.
const SITE_URL = "https://ai-native-frontdoor.vercel.app";

const DESCRIPTION =
  "A front door for spending that lives in Slack and email. A model reads the request, " +
  "a policy rule in code decides it, and procurement finds out first.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "Frontdoor · AI-Native Product Design",
    template: "%s · Frontdoor",
  },
  description: DESCRIPTION,
  openGraph: {
    title: "Frontdoor · AI-Native Product Design",
    description: DESCRIPTION,
    type: "website",
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
