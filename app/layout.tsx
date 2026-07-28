import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Radar Agent — Autonomous signals on Arc",
  description:
    "An autonomous agent buying market signals through x402 USDC nanopayments on Arc.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

