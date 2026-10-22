import type { Metadata } from "next";
import "./globals.css";
import OfflineBanner from "./components/OfflineBanner";
import ServiceWorkerRegister from "./components/ServiceWorkerRegister";

export const metadata: Metadata = {
  title: "HistoPath Companion",
  description: "Private histopathology case companion",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "HistoPath" },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <ServiceWorkerRegister />
        <OfflineBanner />
        <main>{children}</main>
      </body>
    </html>
  );
}
