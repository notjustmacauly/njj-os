import Link from "next/link";
import { COMPANY } from "@/lib/company";

export function SiteFooter() {
  return (
    <footer className="mt-20 border-t border-border bg-creamDk/60">
      <div className="max-w-6xl mx-auto px-4 py-10 grid gap-8 sm:grid-cols-3 text-sm">
        <div className="space-y-2">
          <div className="font-serif text-lg font-bold text-ink">{COMPANY.brandName}</div>
          <p className="text-inkSoft">Cold-pressed juice, delivered fresh.</p>
        </div>
        <div className="space-y-2">
          <div className="text-xs uppercase tracking-smallcaps font-semibold text-inkSoft">Shop</div>
          <Link href="/shop" className="block text-ink hover:text-berry transition">
            All packs
          </Link>
          <span className="block text-inkSoft/60">Events (coming soon)</span>
        </div>
        <div className="space-y-2">
          <div className="text-xs uppercase tracking-smallcaps font-semibold text-inkSoft">Contact</div>
          <a href={`mailto:${COMPANY.email}`} className="block text-ink hover:text-berry transition">
            {COMPANY.email}
          </a>
          <p className="text-inkSoft">{COMPANY.address}</p>
        </div>
      </div>
      <div className="border-t border-border">
        <div className="max-w-6xl mx-auto px-4 py-4 text-xs text-inkSoft flex flex-wrap items-center justify-between gap-2">
          <span>
            © {COMPANY.registeredName}
          </span>
          <span>TIN {COMPANY.tin}</span>
        </div>
      </div>
    </footer>
  );
}
