import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Radar Agent — Agent API payments and accounting on Arc",
  description:
    "Paid API calls for agents with spending limits, recoverable receipts, retry accounting and verified Arc mainnet payment evidence.",
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

