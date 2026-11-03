import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Radar Agent — Know what your agent paid for",
  description:
    "Trace the cost, result and retries of agent API payments. Recover original receipts and reconcile USDC payments on Arc.",
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

