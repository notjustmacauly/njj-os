import type { Metadata } from "next";
import { COMPANY } from "@/lib/company";
import { SiteHeader } from "./_components/site-header";
import { SiteFooter } from "./_components/site-footer";

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
    <div className="min-h-screen bg-cream text-ink flex flex-col">
      <SiteHeader />
      <main className="flex-1">{children}</main>
      <SiteFooter />
    </div>
  );
}
