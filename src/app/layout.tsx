import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Always On Generators – Book service online", template: "%s | Always On Generators" },
  description: "Upfront pricing and online booking for generator service, maintenance plans and installation consultations.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="flex min-h-full flex-col font-sans">{children}</body>
    </html>
  );
}
