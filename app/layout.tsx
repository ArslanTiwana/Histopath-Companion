import type { Metadata, Viewport } from "next";
import "./globals.css";
import OfflineBanner from "./components/OfflineBanner";
import ServiceWorkerRegister from "./components/ServiceWorkerRegister";
import { AuthStateProvider } from "./components/AuthState";
import { VoiceProvider } from "./components/VoiceProvider";
import { ActionProvider } from "./components/ActionProvider";
import ActionAudit from "./components/ActionAudit";
import RequestErrorBanner from "./components/RequestErrorBanner";
import { isAuthenticated } from "@/lib/auth";

export const metadata: Metadata = {
  title: "HistoPath Companion",
  description: "Private histopathology case companion",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "HistoPath", statusBarStyle: "default" },
  icons: {
    icon: [
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/icon-192.png", sizes: "192x192" }],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#3D3A8C",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const authenticated = await isAuthenticated().catch(() => false);
  return (
    <html lang="en">
      <body>
        <ServiceWorkerRegister />
        <AuthStateProvider authenticated={authenticated}>
          <ActionProvider>
            <OfflineBanner />
            <VoiceProvider>
              <ActionAudit />
              <RequestErrorBanner />
              <main>{children}</main>
            </VoiceProvider>
          </ActionProvider>
        </AuthStateProvider>
      </body>
    </html>
  );
}
