import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Earnings Tracker — LKP Securities",
  description:
    "Automated BSE quarterly financial results — Revenue, Net Profit, EBITDA & margins with YoY and QoQ change, newest first. Every number links to its original BSE filing.",
  applicationName: "Earnings Tracker — LKP Securities",
  authors: [{ name: "LKP Securities" }],
};

export const viewport: Viewport = {
  themeColor: "#1e3a8a",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
