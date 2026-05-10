import type { Metadata } from "next";
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
      <body>{children}</body>
    </html>
  );
}
