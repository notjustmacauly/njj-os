import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "NotJust OS",
  description: "Operating system for NotJust Enterprises Inc.",
  // Lets iOS show a proper title + run full-screen when added to home screen.
  appleWebApp: {
    capable: true,
    title: "NotJust OS",
    statusBarStyle: "default",
  },
};

// Disable user zoom on mobile — accidental double-tap during a busy POS
// checkout is annoying and slows the booth down. Pinch-zoom is also off.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  // Tints the mobile browser/status bar to the brand coral.
  themeColor: "#E89F8F",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
