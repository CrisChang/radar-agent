import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Radar Agent — Market data and payment receipts on Arc",
  description:
    "USDC pay-per-query ETH/BTC data for agents, with spending checks, recoverable receipts and mainnet payment evidence on Arc.",
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

