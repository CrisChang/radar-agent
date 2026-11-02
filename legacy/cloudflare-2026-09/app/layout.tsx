import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Radar Agent — Agents pay, decide and settle on Arc",
  description:
    "A verified autonomous agent that buys market signals through x402 USDC nanopayments, applies deterministic safety rules and settles on Arc.",
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000",
  ),
  openGraph: {
    title: "Radar Agent — Programmable market intelligence on Arc",
    description:
      "Signal → x402 payment → guarded decision → verified Arc settlement.",
    type: "website",
    images: [
      {
        url: "/og.png",
        width: 1200,
        height: 630,
        alt: "Radar Agent: pay, decide and settle on Arc",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Radar Agent — Programmable market intelligence on Arc",
    description:
      "Signal → x402 payment → guarded decision → verified Arc settlement.",
    images: ["/og.png"],
  },
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
