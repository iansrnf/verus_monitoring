import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthGate } from "@/app/components/AuthGate";
import "./globals.css";

export const metadata: Metadata = {
  title: "Verus Device Monitor",
  description: "Live monitoring dashboard for Verus mobile devices",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <Suspense
          fallback={
            <main className="page authLoadingPage">
              <div className="authLoadingPanel">Checking access...</div>
            </main>
          }
        >
          <AuthGate>{children}</AuthGate>
        </Suspense>
      </body>
    </html>
  );
}
