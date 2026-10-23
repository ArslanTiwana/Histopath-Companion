import type { Metadata } from "next";
import "./globals.css";
import OfflineBanner from "./components/OfflineBanner";
import ServiceWorkerRegister from "./components/ServiceWorkerRegister";
import { AuthStateProvider } from "./components/AuthState";
import { VoiceProvider } from "./components/VoiceProvider";
import { ActionProvider } from "./components/ActionProvider";
import ActionAudit from "./components/ActionAudit";
import { isAuthenticated } from "@/lib/auth";

export const metadata: Metadata = {
  title: "HistoPath Companion",
  description: "Private histopathology case companion",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "HistoPath" },
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
              <main>{children}</main>
            </VoiceProvider>
          </ActionProvider>
        </AuthStateProvider>
      </body>
    </html>
  );
}
