import type { Metadata } from "next";
import { Manrope, Fraunces } from "next/font/google";
import { COMPANY } from "@/lib/company";
import { SiteHeader } from "./_components/site-header";
import { SiteFooter } from "./_components/site-footer";

// Storefront type: Manrope = clean modern body; Fraunces = warm editorial
// display for headlines. Scoped to the store via CSS variables so the OS
// dashboard keeps its own fonts.
const bodyFont = Manrope({
  subsets: ["latin"],
  variable: "--font-body",
  display: "swap",
});
const displayFont = Fraunces({
  subsets: ["latin"],
  variable: "--font-display",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: `${COMPANY.brandName} — Cold-pressed juice, delivered fresh`,
    template: `%s · ${COMPANY.brandName}`,
  },
  description:
    "Cold-pressed juice packs delivered fresh. Order online from Not Just Juice.",
};

export default function StoreLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      className={`${bodyFont.variable} ${displayFont.variable} font-body min-h-screen bg-cream text-ink flex flex-col`}
    >
      <SiteHeader />
      <main className="flex-1">{children}</main>
      <SiteFooter />
    </div>
  );
}
