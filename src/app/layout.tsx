import type { Metadata, Viewport } from "next";
import { BRAND } from "@/lib/brand";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Always On Generators – Book service online", template: "%s | Always On Generators" },
  icons: { icon: BRAND.icon, apple: BRAND.icon },
  appleWebApp: { capable: true, title: "Always On", statusBarStyle: "black-translucent" },
  formatDetection: { telephone: true },
  description: "Upfront pricing and online booking for generator service, maintenance plans and installation consultations.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover", // lets the bottom bar sit above the iPhone home indicator
  themeColor: "#231f20",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full antialiased">
      <head>
        {/* Same typefaces as alwaysongenerators.com: Montserrat for headings, Source Sans 3 for text. */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font -- loaded at runtime so the build needs no network access */}
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Montserrat:wght@600;700;800;900&family=Source+Sans+3:wght@400;600;700&display=swap" />
      </head>
      <body className="flex min-h-full flex-col font-sans">{children}</body>
    </html>
  );
}
