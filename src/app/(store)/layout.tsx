import type { Metadata } from "next";
import { Manrope, Bricolage_Grotesque } from "next/font/google";
import { COMPANY } from "@/lib/company";
import { SiteHeader } from "./_components/site-header";
import { SiteFooter } from "./_components/site-footer";
import { CartProvider } from "./_components/cart";

// Storefront type: Bricolage Grotesque = characterful grotesk display;
// Manrope = clean body. Scoped to the store via CSS variables so the OS
// dashboard keeps its own fonts.
const bodyFont = Manrope({
  subsets: ["latin"],
  variable: "--font-body",
  display: "swap",
});
const displayFont = Bricolage_Grotesque({
  subsets: ["latin"],
  variable: "--font-display",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: `${COMPANY.brandName} | Cold-pressed juice, delivered fresh`,
    template: `%s · ${COMPANY.brandName}`,
  },
  description:
    "Cold-pressed juice packs delivered fresh. Order online from Not Just Juice.",
};

export default function StoreLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      className={`store ${bodyFont.variable} ${displayFont.variable} font-body antialiased min-h-[100dvh] bg-s-canvas text-s-fg flex flex-col`}
    >
      <CartProvider>
        <SiteHeader />
        <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[70] focus:rounded-full focus:bg-s-invert focus:text-s-invert-fg focus:px-4 focus:py-2">
          Skip to content
        </a>
        <main id="main" className="flex-1">
          {children}
        </main>
        <SiteFooter />
      </CartProvider>
    </div>
  );
}
